import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const project = await prisma.project.findFirst({ where: { id, userId } })
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const { scenes } = (await req.json()) as {
    scenes: Array<{ description: string; voice_script?: string; order_index: number; duration_seconds: number }>
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return NextResponse.json({ error: "scenes array is required" }, { status: 400 })
  }

  // Only CREATE new scenes — never delete existing ones.
  // Callers are responsible for only sending scenes that don't yet have a DB record.
  await prisma.scene.createMany({
    data: scenes.map((s) => ({
      projectId: id,
      description: s.description,
      voiceScript: s.voice_script ?? null,
      orderIndex: s.order_index,
      durationSeconds: s.duration_seconds,
    })),
  })

  // Return the newly created scenes, identified by their orderIndex values.
  const orderIndexes = scenes.map((s) => s.order_index)
  const created = await prisma.scene.findMany({
    where: { projectId: id, orderIndex: { in: orderIndexes } },
    orderBy: { orderIndex: "asc" },
  })

  return NextResponse.json({ scenes: created })
}
