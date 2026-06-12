import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const { character_id, voice_id, title } = await req.json()

  if (!character_id) {
    return NextResponse.json({ error: "character_id is required" }, { status: 400 })
  }

  const project = await prisma.project.create({
    data: {
      userId,
      characterId: character_id,
      voiceId: voice_id ?? null,
      title: title ?? "Untitled Video",
      status: "pending",
    },
  })

  return NextResponse.json({ project }, { status: 201 })
}
