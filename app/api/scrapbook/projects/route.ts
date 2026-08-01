import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { STYLE_PRESETS, type ScrapbookStyle } from "@/lib/scrapbook/config"

// POST /api/scrapbook/projects — create a new draft scrapbook project.
// Photos are added in a second call so we can validate them before creating rows.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const { title, style } = await req.json() as { title?: string; style?: string }
  const styleValid: ScrapbookStyle = (style && style in STYLE_PRESETS) ? style as ScrapbookStyle : "watercolor"

  const project = await prisma.scrapbookProject.create({
    data: {
      userId,
      title: title?.trim() || "Untitled Scrapbook",
      style: styleValid,
      status: "draft",
    },
  })
  return NextResponse.json({ project }, { status: 201 })
}

// GET /api/scrapbook/projects — list user's scrapbook projects (newest first).
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const projects = await prisma.scrapbookProject.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { pages: true } } },
  })
  return NextResponse.json({ projects })
}
