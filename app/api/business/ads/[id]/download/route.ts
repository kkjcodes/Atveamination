import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

// GET /api/business/ads/[id]/download — force a real file download of the ad MP4.
// The final video lives on Azure Blob (cross-origin), so a bare <a download>
// on the blob URL only opens the video inline — the browser ignores the download
// attribute for cross-origin resources. Proxy it here with an explicit
// Content-Disposition: attachment header so the click actually saves a file.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: adId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ad = await prisma.ad.findFirst({
    where: { id: adId, business: { userId: session.user.id } },
    include: { business: { select: { name: true } } },
  })
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 })

  const version = await prisma.adVersion.findFirst({
    where: { adId: ad.id, versionNo: ad.currentVersion },
    select: { renderAssetId: true },
  })
  if (!version?.renderAssetId) {
    return NextResponse.json({ error: "No rendered video for this ad yet" }, { status: 404 })
  }

  const asset = await prisma.asset.findFirst({
    where: { id: version.renderAssetId, userId: session.user.id },
    select: { url: true },
  })
  if (!asset?.url) {
    return NextResponse.json({ error: "Render asset missing" }, { status: 404 })
  }

  const upstream = await fetch(asset.url)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Blob fetch failed: ${upstream.status}` }, { status: 502 })
  }

  const slug = (ad.business.name || "ad").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "ad"
  const filename = `${slug}-${ad.aspectRatio.replace(":", "x")}.mp4`

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": upstream.headers.get("Content-Length") ?? "",
      "Cache-Control": "no-store",
    },
  })
}
