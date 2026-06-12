import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { uploadBlob } from "@/lib/storage/client"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const formData = await req.formData()
  const file = formData.get("photo") as File | null
  const name = (formData.get("name") as string | null) ?? "My Character"
  const characterDescription = (formData.get("character_description") as string | null) ?? null

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 })
  }

  const blobPath = `${userId}/characters/${Date.now()}-${file.name}`
  const buffer = Buffer.from(await file.arrayBuffer())
  const blobUrl = await uploadBlob(blobPath, buffer, file.type)

  const character = await prisma.character.create({
    data: { userId, name, sourcePhotoUrl: blobUrl, characterDescription },
  })

  return NextResponse.json({ character }, { status: 201 })
}
