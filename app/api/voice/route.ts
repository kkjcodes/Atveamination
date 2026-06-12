import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { uploadBlob } from "@/lib/storage/client"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const form = await req.formData()
  const audio = form.get("audio") as File | null
  const characterId = form.get("character_id") as string | null
  const ttsParamsRaw = form.get("tts_params") as string | null

  if (!audio || !characterId) {
    return NextResponse.json({ error: "audio and character_id are required" }, { status: 400 })
  }

  const blobPath = `${userId}/voices/${Date.now()}.webm`
  const buffer = Buffer.from(await audio.arrayBuffer())
  const url = await uploadBlob(blobPath, buffer, "audio/webm")

  const voice = await prisma.voice.create({
    data: {
      userId,
      characterId,
      sampleAudioUrl: url,
      ttsParams: JSON.parse(ttsParamsRaw ?? "{}"),
    },
  })

  return NextResponse.json({ voice }, { status: 201 })
}
