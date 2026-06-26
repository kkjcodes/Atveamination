import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const project = await prisma.project.findFirst({
    where: { id, userId },
    include: {
      scenes: { orderBy: { orderIndex: "asc" } },
      characters: {
        orderBy: { orderIndex: "asc" },
        include: { character: { select: { id: true, name: true, selectedStyleUrl: true, sourcePhotoUrl: true, selectedStyle: true, loraTrainingStatus: true } } },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  // Normalize nested character objects to snake_case for consistent API shape
  const normalized = {
    ...project,
    characters: project.characters.map((pc) => ({
      ...pc,
      character: {
        id: pc.character.id,
        name: pc.character.name,
        selected_style_url: pc.character.selectedStyleUrl,
        source_photo_url: pc.character.sourcePhotoUrl,
        selected_style: pc.character.selectedStyle,
        lora_training_status: pc.character.loraTrainingStatus,
      },
    })),
  }

  return NextResponse.json({ project: normalized })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const project = await prisma.project.findFirst({ where: { id, userId } })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const { title } = await req.json()
  if (!title?.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 })

  const updated = await prisma.project.update({ where: { id }, data: { title: title.trim() } })
  return NextResponse.json({ title: updated.title })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const project = await prisma.project.findFirst({ where: { id, userId } })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  await prisma.project.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
