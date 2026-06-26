import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const { character_id, character_ids, voice_id, title } = await req.json()

  // Normalize: accept either character_id (single) or character_ids (multi)
  const ids: string[] = character_ids?.length
    ? character_ids
    : character_id
      ? [character_id]
      : []

  if (ids.length === 0) {
    return NextResponse.json({ error: "character_id or character_ids is required" }, { status: 400 })
  }

  // Verify all characters belong to the user
  const chars = await prisma.character.findMany({ where: { id: { in: ids }, userId }, select: { id: true } })
  if (chars.length !== ids.length) {
    return NextResponse.json({ error: "One or more characters not found" }, { status: 404 })
  }

  const project = await prisma.project.create({
    data: {
      userId,
      characterId: ids[0],
      voiceId: voice_id ?? null,
      title: title ?? "Untitled Video",
      status: "pending",
      characters: {
        create: ids.map((id, i) => ({ characterId: id, orderIndex: i })),
      },
    },
  })

  return NextResponse.json({ project }, { status: 201 })
}
