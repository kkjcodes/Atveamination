import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

// GET /api/scrapbook/pages/[id] — polling backstop. In dev/local the fal
// webhook doesn't fire (localhost isn't reachable), so the UI polls and this
// endpoint runs the same "chunk complete" advance logic the webhook would.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const page = await prisma.scrapbookPage.findFirst({
    where: { id },
    include: { project: { select: { userId: true, style: true } } },
  })
  if (!page || page.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // In-process polling advance is only meaningful when a WAN FLF2V request is
  // outstanding (dynamic route). Subtle + fallback complete synchronously
  // inside the /generate handler, so nothing to advance here.
  // TODO: when webhook path is fully wired, add fal.queue.status probe here.

  return NextResponse.json({ page })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const page = await prisma.scrapbookPage.findFirst({
    where: { id },
    include: { project: { select: { userId: true } } },
  })
  if (!page || page.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }
  await prisma.scrapbookPage.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
