import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { validateAdScript, type AdScript, type ValidateContext } from "@/lib/business/adscript-schema"
import { emit } from "@/lib/events"

// POST /api/business/ads/[id]/script — inline script editing (deferred item
// shipped 2026-08-26): the user edits a scene's overlay text or narration
// directly. No AI call — the merged script just re-validates against the
// same rules the generator obeys, then lands as a new AdVersion so revert
// keeps working. Body: { edits: [{ index, text?, vo_text?, lines? }] }.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: adId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const ad = await prisma.ad.findFirst({
    where: { id: adId, business: { userId } },
    include: { business: { select: { id: true, logoAssetId: true } } },
  })
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 })
  if (!ad.adScript) return NextResponse.json({ error: "No script to edit yet" }, { status: 400 })

  const body = await req.json().catch(() => ({})) as {
    edits?: Array<{ index?: number; text?: string; vo_text?: string; lines?: string[] }>
  }
  const edits = Array.isArray(body.edits) ? body.edits : []
  if (edits.length === 0) return NextResponse.json({ error: "Nothing to save" }, { status: 400 })

  const script = JSON.parse(JSON.stringify(ad.adScript)) as AdScript
  for (const e of edits) {
    const i = e.index
    if (typeof i !== "number" || i < 0 || i >= script.scenes.length) {
      return NextResponse.json({ error: "Unknown scene in edit" }, { status: 400 })
    }
    const scene = script.scenes[i]
    if (scene.type === "end_card") {
      if (Array.isArray(e.lines)) {
        scene.lines = e.lines.map((l) => String(l).trim()).filter(Boolean)
      }
    } else {
      if (typeof e.text === "string") scene.text = e.text.trim()
      if (typeof e.vo_text === "string") scene.vo_text = e.vo_text.trim()
    }
  }

  // Same validation the generator faces — word caps, durations, photo order.
  const photos = await prisma.asset.findMany({
    where: { userId, kind: "product_photo", blobPath: { startsWith: `business/${ad.business.id}/photos/` } },
    select: { id: true },
  })
  const ctx: ValidateContext = {
    validAssetIds: new Set(photos.map((p) => p.id)),
    validLogoAssetId: ad.business.logoAssetId,
  }
  const errors = validateAdScript(script, ctx)
  if (errors.length > 0) {
    // Surface the FIRST problem in plain words — the user is editing one
    // field at a time, so one message beats a validator dump.
    const first = errors[0]
    return NextResponse.json(
      { error: `That edit doesn't fit the ad's rules: ${first.message}`, details: errors },
      { status: 422 },
    )
  }

  const nextVersion = ad.currentVersion + 1
  const [version] = await prisma.$transaction([
    prisma.adVersion.create({
      data: { adId: ad.id, versionNo: nextVersion, adScript: script as unknown as object, editRequest: "(inline edit)" },
    }),
    prisma.ad.update({
      where: { id: ad.id },
      data: { adScript: script as unknown as object, currentVersion: nextVersion },
    }),
  ])
  void emit("adscript_generated", { adId: ad.id, templateFamily: ad.templateFamily, retry: false, success: true, inline: true }, userId)

  return NextResponse.json({ script, versionNo: version.versionNo })
}
