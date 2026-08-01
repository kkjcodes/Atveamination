import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { buildRevertVersion } from "@/lib/business/iterate"
import type { AdScript } from "@/lib/business/adscript-schema"
import { emit } from "@/lib/events"

// POST /api/business/ads/[id]/revert  body: { versionNo: number }
// "Revert to version N" = copy-forward as a new version. History stays intact.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: adId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ad = await prisma.ad.findFirst({
    where: { id: adId, business: { userId: session.user.id } },
    select: { id: true, currentVersion: true },
  })
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { versionNo?: number }
  const targetVersionNo = typeof body.versionNo === "number" ? body.versionNo : NaN
  if (!Number.isFinite(targetVersionNo)) {
    return NextResponse.json({ error: "versionNo is required" }, { status: 400 })
  }

  const source = await prisma.adVersion.findUnique({
    where: { adId_versionNo: { adId, versionNo: targetVersionNo } },
  })
  if (!source) return NextResponse.json({ error: `Version ${targetVersionNo} not found` }, { status: 404 })

  const nextVersionNo = ad.currentVersion + 1
  const payload = buildRevertVersion(source.adScript as unknown as AdScript, nextVersionNo, targetVersionNo)

  const version = await prisma.adVersion.create({
    data: {
      adId,
      versionNo: payload.versionNo,
      adScript: payload.adScript as unknown as object,
      editRequest: payload.editRequest,
    },
  })

  await prisma.ad.update({
    where: { id: adId },
    data: {
      adScript: payload.adScript as unknown as object,
      currentVersion: nextVersionNo,
      status: "ready",
    },
  })

  void emit("version_reverted", { adId, fromVersion: targetVersionNo, newVersion: nextVersionNo }, session.user.id)

  return NextResponse.json({ version, currentVersion: nextVersionNo }, { status: 201 })
}
