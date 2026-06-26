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

  if (!characterId) {
    return NextResponse.json({ error: "character_id is required" }, { status: 400 })
  }

  const ownedChar = await prisma.character.findFirst({ where: { id: characterId, userId }, select: { id: true } })
  if (!ownedChar) return NextResponse.json({ error: "Character not found" }, { status: 404 })

  const ttsParams = JSON.parse(ttsParamsRaw ?? "{}")

  // Preset voice: no recording needed — kokoroVoice in ttsParams identifies the voice
  if (!audio && !ttsParams.kokoroVoice) {
    return NextResponse.json({ error: "audio or a preset voice selection is required" }, { status: 400 })
  }

  let sampleAudioUrl: string | null = null
  if (audio) {
    const blobPath = `${userId}/voices/${Date.now()}.webm`
    const buffer = Buffer.from(await audio.arrayBuffer())
    sampleAudioUrl = await uploadBlob(blobPath, buffer, "audio/webm")
  }

  const voice = await prisma.voice.create({
    data: {
      userId,
      characterId,
      sampleAudioUrl,
      ttsParams,
    },
  })

  return NextResponse.json({ voice }, { status: 201 })
}
