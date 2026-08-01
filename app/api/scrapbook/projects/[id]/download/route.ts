import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

// GET /api/scrapbook/projects/[id]/download — force a real file download of
// the final scrapbook MP4. The video lives on Azure Blob (cross-origin), so
// a bare <a download> on the blob URL only opens the video inline (browsers
// ignore the download attribute for cross-origin resources). Proxy here with
// an explicit Content-Disposition: attachment header so the click writes a file.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const project = await prisma.scrapbookProject.findFirst({
    where: { id: projectId, userId: session.user.id },
    select: { title: true, finalVideoUrl: true },
  })
  if (!project?.finalVideoUrl) {
    return NextResponse.json({ error: "No final scrapbook yet" }, { status: 404 })
  }

  const upstream = await fetch(project.finalVideoUrl)
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: `Blob fetch failed: ${upstream.status}` }, { status: 502 })
  }

  const slug = (project.title || "scrapbook").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "scrapbook"
  const filename = `${slug}.mp4`

  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": upstream.headers.get("Content-Length") ?? "",
      "Cache-Control": "no-store",
    },
  })
}
