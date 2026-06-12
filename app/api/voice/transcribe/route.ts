import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { replicate, MODELS } from "@/lib/replicate/client"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await req.formData()
  const audio = form.get("audio") as File | null

  if (!audio) {
    return NextResponse.json({ error: "audio is required" }, { status: 400 })
  }

  const buffer = Buffer.from(await audio.arrayBuffer())
  const audioDataUri = `data:audio/webm;base64,${buffer.toString("base64")}`

  const output = (await replicate.run(MODELS.whisper, { input: { audio: audioDataUri } })) as {
    transcription?: string
    detected_language?: string
  } | null

  return NextResponse.json({
    transcript: output?.transcription ?? "",
    detected_language: output?.detected_language ?? "",
  })
}
