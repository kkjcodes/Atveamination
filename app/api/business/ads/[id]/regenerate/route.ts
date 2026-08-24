import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import {
  generateAdScript,
  makeAdScriptInput,
} from "@/lib/business/adscript"
import { musicForFamily } from "@/lib/business/music-catalog"
import { occasionById, occasionBrief } from "@/lib/business/occasions"
import type { AdScript, TemplateFamily, AspectRatio, Voice } from "@/lib/business/adscript-schema"
import { emit } from "@/lib/events"
import { killSwitchEngaged } from "@/lib/limits"

// POST /api/business/ads/[id]/regenerate — re-runs Sonnet against the same
// Ad row using the persisted templateFamily + aspectRatio + preferredVoice.
// Called from the ad detail page's "Try writing the ad again" button after
// initial generation failed. Keeps the Ad ID stable so bookmarks / share
// links keep working across retries.
export const maxDuration = 120

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: adId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const kill = await killSwitchEngaged()
  if (kill.engaged) {
    void emit("kill_switch_tripped", { route: "adscript_regenerate", reason: kill.reason })
    return NextResponse.json({ error: "AI generation is temporarily paused." }, { status: 503 })
  }

  const ad = await prisma.ad.findFirst({
    where: { id: adId, business: { userId } },
    include: {
      business: { include: { logo: true } },
    },
  })
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 })

  const photos = await prisma.asset.findMany({
    where: {
      userId,
      kind: "product_photo",
      blobPath: { startsWith: `business/${ad.business.id}/photos/` },
    },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
  })
  if (photos.length === 0) {
    return NextResponse.json({ error: "Add at least one product photo first" }, { status: 400 })
  }

  const photoInputs = await Promise.all(
    photos.map(async (p) => {
      const res = await fetch(p.url)
      const buffer = Buffer.from(await res.arrayBuffer())
      return { assetId: p.id, mimeType: p.mimeType, buffer }
    }),
  )

  const availableMusic = (await musicForFamily(ad.templateFamily as TemplateFamily)).map((m) => ({ id: m.id, label: m.label }))
  const input = makeAdScriptInput(
    {
      name: ad.business.name,
      oneLiner: ad.business.oneLiner,
      address: ad.business.address,
      notes: ad.business.notes,
      logoAssetId: ad.business.logoAssetId,
    },
    photoInputs,
    ad.templateFamily as TemplateFamily,
    ad.aspectRatio as AspectRatio,
    availableMusic,
    {
      occasionBrief: occasionBrief(occasionById(ad.occasion)),
      phone: ad.business.phone,
      website: ad.business.website,
    },
  )

  const result = await generateAdScript(input)
  if (!result.ok) {
    await prisma.ad.update({
      where: { id: adId },
      data: { status: "failed" },
    })
    void emit("adscript_generated", { adId, templateFamily: ad.templateFamily, retry: true, success: false }, userId)
    return NextResponse.json(
      { error: "AI couldn't generate a valid ad. Try again.", details: result.errors, adId },
      { status: 422 },
    )
  }
  void emit("adscript_generated", { adId, templateFamily: ad.templateFamily, retry: result.repairUsed, success: true }, userId)

  const finalScript: AdScript = ad.preferredVoice
    ? { ...result.script, audio: { ...result.script.audio, voice: ad.preferredVoice as Voice } }
    : result.script

  const nextVersionNo = (ad.currentVersion ?? 0) + 1
  const version = await prisma.adVersion.create({
    data: {
      adId,
      versionNo: nextVersionNo,
      adScript: finalScript as unknown as object,
      editRequest: null,
    },
  })

  await prisma.ad.update({
    where: { id: adId },
    data: {
      status: "ready",
      adScript: finalScript as unknown as object,
      currentVersion: nextVersionNo,
    },
  })

  return NextResponse.json({ ad: { ...ad, currentVersion: nextVersionNo, status: "ready" }, version }, { status: 200 })
}
