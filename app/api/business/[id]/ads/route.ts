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

  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
    include: { logo: true },
  })
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 })

  const body = await req.json().catch(() => ({})) as {
    templateFamily?: unknown
    aspectRatio?: unknown
    voice?: unknown  // optional; if provided we override AdScript's picked voice
  }
  const templateFamily = coerceTemplateFamily(body.templateFamily)
  const aspectRatio = coerceAspectRatio(body.aspectRatio)
  const preferredVoice = coerceVoice(body.voice)
  if (!templateFamily) return NextResponse.json({ error: "templateFamily is required" }, { status: 400 })
  if (!aspectRatio) return NextResponse.json({ error: "aspectRatio is required" }, { status: 400 })

  const photos = await prisma.asset.findMany({
    where: {
      userId,
      kind: "product_photo",
      blobPath: { startsWith: `business/${businessId}/photos/` },
    },
    orderBy: { createdAt: "asc" },
  })
  if (photos.length === 0) {
    return NextResponse.json({ error: "Add at least one product photo first" }, { status: 400 })
  }

  const ad = await prisma.ad.create({
    data: {
      businessId,
      status: "draft",
      templateFamily,
      aspectRatio,
      currentVersion: 0,
      preferredVoice, // persisted so a failed generation can be retried without re-picking
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

  const availableMusic = (await musicForFamily(templateFamily)).map((m) => ({ id: m.id, label: m.label }))
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
  )

  const result = await generateAdScript(input)
  if (!result.ok) {
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

  // Override Sonnet's voice pick if the user chose one in the picker. Sonnet
  // still picks music/level/palette based on the business tone.
  const finalScript = preferredVoice
    ? { ...result.script, audio: { ...result.script.audio, voice: preferredVoice } }
    : result.script

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
