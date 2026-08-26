import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import {
  generateAdScript,
  makeAdScriptInput,
  coerceAspectRatio,
  coerceTemplateFamily,
} from "@/lib/business/adscript"
import { VOICES, type Voice } from "@/lib/business/adscript-schema"
import { musicForFamily } from "@/lib/business/music-catalog"
import { occasionById, occasionBrief } from "@/lib/business/occasions"
import { isBudgetError, ensureKickoffBudget } from "@/lib/budget/guard"
import { isPresenterEligibleStyle } from "@/lib/business/presenter"
import { emit } from "@/lib/events"
import { killSwitchEngaged } from "@/lib/limits"

function coerceVoice(raw: unknown): Voice | null {
  return typeof raw === "string" && (VOICES as readonly string[]).includes(raw) ? (raw as Voice) : null
}

export const maxDuration = 120

// POST /api/business/[id]/ads — generate a NEW Ad + AdVersion 1 for this
// business via Sonnet vision. Body: { templateFamily, aspectRatio }.
//
// Design: Ad row is created BEFORE calling Sonnet (status="draft"), so a
// mid-generation failure leaves a Retry-able Ad row on the business page.
// This is the resumability requirement — no failed API call ever loses
// the "I asked for an ad" intent.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: businessId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const kill = await killSwitchEngaged()
  if (kill.engaged) {
    void emit("kill_switch_tripped", { route: "adscript_generate", reason: kill.reason })
    return NextResponse.json({ error: "AI generation is temporarily paused." }, { status: 503 })
  }

  try {
    await ensureKickoffBudget()
  } catch (e) {
    if (isBudgetError(e)) return NextResponse.json({ error: e.message }, { status: 503 })
    throw e
  }

  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
    include: { logo: true },
  })
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    templateFamily?: unknown
    aspectRatio?: unknown
    voice?: unknown  // optional; if provided we override AdScript's picked voice
    assetIds?: unknown  // optional ordered photo selection; order = scene order
    voiceover?: unknown  // false → music-only ad (render skips TTS)
    occasion?: unknown  // occasion chip id (lib/business/occasions.ts)
    musicId?: unknown   // optional; overrides AdScript's picked music track
    captions?: unknown  // false → no burned-in narration subtitles
    qr?: unknown        // false → no end-card QR code
    contactStrip?: unknown // true → phone chip on every scene
    presenterCharacterId?: unknown // cartoon presenter (requires voiceover)
    presenterSlot?: unknown        // "hook" | "cta"
  }
  const templateFamily = coerceTemplateFamily(body.templateFamily)
  const aspectRatio = coerceAspectRatio(body.aspectRatio)
  const preferredVoice = coerceVoice(body.voice)
  if (!templateFamily) return NextResponse.json({ error: "templateFamily is required" }, { status: 400 })
  if (!aspectRatio) return NextResponse.json({ error: "aspectRatio is required" }, { status: 400 })

  const photoWhere = {
    userId,
    kind: "product_photo" as const,
    blobPath: { startsWith: `business/${businessId}/photos/` },
  }
  // Ordered selection from the picker. Dedupe keeping first occurrence; the
  // array order is the user's chosen photo order and flows through the
  // AdScript prompt + enforcePhotoOrder.
  const selectedIds = Array.isArray(body.assetIds)
    ? [...new Set(body.assetIds.filter((x): x is string => typeof x === "string"))]
    : null
  let photos
  if (selectedIds && selectedIds.length > 0) {
    if (selectedIds.length > 8) {
      return NextResponse.json({ error: "Pick up to 8 photos per ad" }, { status: 400 })
    }
    const found = await prisma.asset.findMany({ where: { ...photoWhere, id: { in: selectedIds } } })
    const byId = new Map(found.map((a) => [a.id, a]))
    if (selectedIds.some((id) => !byId.has(id))) {
      return NextResponse.json({ error: "Some selected photos no longer exist. Refresh and try again." }, { status: 400 })
    }
    photos = selectedIds.map((id) => byId.get(id)!)
  } else {
    photos = await prisma.asset.findMany({
      where: photoWhere,
      orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    })
  }
  if (photos.length === 0) {
    return NextResponse.json({ error: "Add at least one product photo first" }, { status: 400 })
  }

  const occasion = occasionById(typeof body.occasion === "string" ? body.occasion : null)

  // Cartoon presenter: only with narration, only on non-scrapbook templates,
  // only for characters whose style passed the lip-sync bench.
  let presenterCharacterId: string | null = null
  if (
    typeof body.presenterCharacterId === "string" &&
    body.voiceover !== false &&
    templateFamily !== "scrapbook"
  ) {
    const ch = await prisma.character.findFirst({
      where: { id: body.presenterCharacterId, userId },
      select: { selectedStyleUrl: true, selectedStyle: true },
    })
    if (!ch?.selectedStyleUrl) {
      return NextResponse.json({ error: "That character doesn't have a style yet — pick one first." }, { status: 400 })
    }
    if (!isPresenterEligibleStyle(ch.selectedStyle)) {
      return NextResponse.json({ error: "That character's art style can't present yet — try a Pixar, Ghibli, comic, or claymation character." }, { status: 400 })
    }
    presenterCharacterId = body.presenterCharacterId
  }
  const availableMusicAll = await musicForFamily(templateFamily)
  const preferredMusicId =
    typeof body.musicId === "string" && availableMusicAll.some((m) => m.id === body.musicId)
      ? body.musicId
      : null

  const ad = await prisma.ad.create({
    data: {
      businessId,
      status: "draft",
      templateFamily,
      aspectRatio,
      currentVersion: 0,
      preferredVoice, // persisted so a failed generation can be retried without re-picking
      voiceoverEnabled: body.voiceover !== false,
      occasion: occasion?.id ?? null,
      captionsEnabled: body.captions !== false,
      qrEnabled: body.qr !== false,
      contactStrip: body.contactStrip === true,
      presenterCharacterId,
      presenterSlot: body.presenterSlot === "cta" ? "cta" : "hook",
    },
  })

  // Fetch photo buffers for vision input. Do this AFTER the Ad row is
  // created so a fetch failure still leaves a retry-able draft.
  const photoInputs = await Promise.all(
    photos.map(async (p) => {
      const res = await fetch(p.url)
      const buffer = Buffer.from(await res.arrayBuffer())
      return { assetId: p.id, mimeType: p.mimeType, buffer }
    }),
  )

  const availableMusic = availableMusicAll.map((m) => ({ id: m.id, label: m.label }))
  const input = makeAdScriptInput(
    {
      name: business.name,
      oneLiner: business.oneLiner,
      address: business.address,
      notes: business.notes,
      logoAssetId: business.logoAssetId,
    },
    photoInputs,
    templateFamily,
    aspectRatio,
    availableMusic,
    {
      occasionBrief: occasionBrief(occasion),
      phone: business.phone,
      website: business.website,
    },
  )

  let result: Awaited<ReturnType<typeof generateAdScript>>
  try {
    result = await generateAdScript(input)
  } catch (e) {
    if (isBudgetError(e)) {
      await prisma.ad.update({ where: { id: ad.id }, data: { status: "failed" } }).catch(() => {})
      return NextResponse.json({ error: e.message }, { status: 503 })
    }
    throw e
  }
  if (!result.ok) {
    console.error(`[adscript] ${ad.id} generation failed: ${JSON.stringify(result.errors)}`)
    await prisma.ad.update({
      where: { id: ad.id },
      data: { status: "failed" },
    })
    void emit("adscript_generated", { adId: ad.id, templateFamily, retry: false, success: false }, userId)
    return NextResponse.json(
      { error: "AI couldn't generate a valid ad. Try again.", details: result.errors, adId: ad.id },
      { status: 422 },
    )
  }
  void emit("adscript_generated", { adId: ad.id, templateFamily, retry: result.repairUsed, success: true }, userId)

  // Override Sonnet's voice/music picks with the user's explicit choices.
  // Sonnet still picks level/palette based on the business tone.
  const finalScript = {
    ...result.script,
    audio: {
      ...result.script.audio,
      ...(preferredVoice ? { voice: preferredVoice } : {}),
      ...(preferredMusicId ? { music_id: preferredMusicId } : {}),
    },
  }

  // Version 1 is the first successful script. Version 0 is reserved for
  // draft-with-no-script-yet (currentVersion on Ad).
  const version = await prisma.adVersion.create({
    data: {
      adId: ad.id,
      versionNo: 1,
      adScript: finalScript as unknown as object,
      editRequest: null,
    },
  })

  await prisma.ad.update({
    where: { id: ad.id },
    data: {
      status: "ready",
      adScript: finalScript as unknown as object,
      currentVersion: 1,
    },
  })

  return NextResponse.json({ ad: { ...ad, currentVersion: 1, status: "ready" }, version }, { status: 201 })
}

// GET /api/business/[id]/ads — list all ads for this business (newest first).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: businessId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const business = await prisma.business.findFirst({
    where: { id: businessId, userId: session.user.id },
    select: { id: true },
  })
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const ads = await prisma.ad.findMany({
    where: { businessId },
    orderBy: { updatedAt: "desc" },
  })
  return NextResponse.json({ ads })
}
