import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { emit } from "@/lib/events"
import { STALE_WINDOWS } from "@/lib/async-work/claim"

// GET /api/business/ads/[id] — ad + versions + resolved current render URL.
// finalVideoUrl is looked up via currentVersion.renderAssetId so the URL
// survives page reloads. Old client only had the URL from the sync render
// response, so a refresh after a successful render would show the empty
// "Video not made yet" placeholder.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ad = await prisma.ad.findFirst({
    where: { id, business: { userId: session.user.id } },
    include: {
      versions: { orderBy: { versionNo: "asc" } },
      business: { select: { id: true, name: true } },
    },
  })
  if (!ad) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Stale-render reaper (D3): a render whose worker died must reach a
  // TERMINAL state, not sit at "rendering" forever. Twice the stale window
  // (the window itself allows reclaim/retry) → hard-fail so the UI shows
  // the retry button instead of an eternal spinner.
  if (
    ad.status === "rendering" &&
    ad.renderStartedAt &&
    Date.now() - ad.renderStartedAt.getTime() > STALE_WINDOWS.businessRender * 2
  ) {
    await prisma.ad.update({ where: { id: ad.id }, data: { status: "failed" } }).catch(() => {})
    ad.status = "failed"
    console.warn(`[ads] reaped stale render ${ad.id} (started ${ad.renderStartedAt.toISOString()})`)
  }

  const currentVersion = ad.versions.find((v) => v.versionNo === ad.currentVersion)
  let finalVideoUrl: string | null = null
  if (currentVersion?.renderAssetId) {
    const asset = await prisma.asset.findUnique({
      where: { id: currentVersion.renderAssetId },
      select: { url: true },
    })
    finalVideoUrl = asset?.url ?? null
  }

  return NextResponse.json({ ad: { ...ad, finalVideoUrl } })
}

// PATCH /api/business/ads/[id] — settings like gallery opt-in.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owned = await prisma.ad.findFirst({
    where: { id, business: { userId: session.user.id } },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json().catch(() => ({})) as { galleryOptIn?: boolean; captionsEnabled?: boolean }
  await prisma.ad.update({
    where: { id },
    data: {
      ...(typeof body.galleryOptIn === "boolean" && { galleryOptIn: body.galleryOptIn }),
      ...(typeof body.captionsEnabled === "boolean" && { captionsEnabled: body.captionsEnabled }),
    },
  })
  if (typeof body.galleryOptIn === "boolean") {
    void emit("gallery_opt_in", { adId: id, optedIn: body.galleryOptIn }, session.user.id)
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owned = await prisma.ad.findFirst({
    where: { id, business: { userId: session.user.id } },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.ad.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
