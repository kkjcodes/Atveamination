import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

// GET a scrapbook project with all its pages (in order) — used by
// /scrapbook/[id] detail page and polling.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const project = await prisma.scrapbookProject.findFirst({
    where: { id, userId: session.user.id },
    include: {
      pages: { orderBy: { orderIndex: "asc" } },
    },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ project })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owned = await prisma.scrapbookProject.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })

  await prisma.scrapbookProject.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owned = await prisma.scrapbookProject.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json() as { title?: string; style?: string }
  await prisma.scrapbookProject.update({
    where: { id },
    data: {
      ...(body.title !== undefined && { title: body.title.trim() || "Untitled Scrapbook" }),
      ...(body.style !== undefined && { style: body.style }),
    },
  })
  return NextResponse.json({ ok: true })
}
