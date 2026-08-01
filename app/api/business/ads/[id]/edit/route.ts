import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { iterateAdScript } from "@/lib/business/iterate"
import { musicForFamily } from "@/lib/business/music-catalog"
import type { AdScript, TemplateFamily } from "@/lib/business/adscript-schema"
import { emit } from "@/lib/events"
import { killSwitchEngaged } from "@/lib/limits"

export const maxDuration = 120

// POST /api/business/ads/[id]/edit — user requests a change.
// Sonnet returns a fully revised AdScript → new AdVersion row appended.
// The Ad's currentVersion pointer advances. Render is a separate call so
// the UI can show the diff before re-rendering (and the render endpoint
// enforces the per-render quota, not this one).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: adId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const kill = await killSwitchEngaged()
  if (kill.engaged) {
    void emit("kill_switch_tripped", { route: "adscript_edit", reason: kill.reason })
    return NextResponse.json({ error: "AI editing is temporarily paused." }, { status: 503 })
  }

  const ad = await prisma.ad.findFirst({
    where: { id: adId, business: { userId } },
    include: {
      business: { select: { userId: true, logoAssetId: true, id: true } },
    },
  })
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 })
  if (!ad.adScript) return NextResponse.json({ error: "No script to edit" }, { status: 400 })

  const body = await req.json().catch(() => ({})) as { editRequest?: string }
  const editRequest = body.editRequest?.trim()
  if (!editRequest) return NextResponse.json({ error: "editRequest is required" }, { status: 400 })

  const currentScript = ad.adScript as unknown as AdScript

  // Photos are locked at ad-creation time (per doc §5) — the iterate loop
  // can shuffle asset_ids but not add new ones.
  const photos = await prisma.asset.findMany({
    where: {
      userId,
      kind: "product_photo",
      blobPath: { startsWith: `business/${ad.business.id}/photos/` },
    },
    select: { id: true },
  })
  const validAssetIds = new Set(photos.map((p) => p.id))
  const availableMusicIds = (await musicForFamily(ad.templateFamily as TemplateFamily)).map((m) => m.id)

  const result = await iterateAdScript({
    currentScript,
    editRequest,
    validAssetIds,
    validLogoAssetId: ad.business.logoAssetId,
    availableMusicIds,
  })

  if (!result.ok) {
    void emit("edit_requested", { adId, success: false }, userId)
    return NextResponse.json(
      { error: "AI couldn't apply the edit. Try rewording.", details: result.errors },
      { status: 422 },
    )
  }

  const nextVersionNo = ad.currentVersion + 1
  const version = await prisma.adVersion.create({
    data: {
      adId,
      versionNo: nextVersionNo,
      adScript: result.script as unknown as object,
      editRequest,
    },
  })
  void emit("edit_requested", {
    adId,
    versionNo: nextVersionNo,
    success: true,
    repairUsed: result.repairUsed,
    // Detect audio-related edits — used as a signal that the cache is doing its job.
    audio_change: /voice|music|quiet|loud|deeper|slower|faster|pronounce/i.test(editRequest),
  }, userId)

  await prisma.ad.update({
    where: { id: adId },
    data: {
      adScript: result.script as unknown as object,
      currentVersion: nextVersionNo,
      // Reset status so the UI shows "needs re-render" on the edited version.
      status: "ready",
    },
  })

  return NextResponse.json({ version, currentVersion: nextVersionNo }, { status: 201 })
}
