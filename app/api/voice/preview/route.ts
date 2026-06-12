import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { replicate, MODELS } from "@/lib/replicate/client"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await req.formData()
  const audio = form.get("audio") as File | null
  const text = form.get("text") as string | null

  if (!audio || !text?.trim()) {
    return NextResponse.json({ error: "audio and text are required" }, { status: 400 })
  }

  const buffer = Buffer.from(await audio.arrayBuffer())
  const mime = audio.type || "audio/webm"
  const speakerDataUri = `data:${mime};base64,${buffer.toString("base64")}`

  try {
    const output = await replicate.run(MODELS.xttsV2, {
      input: {
        text,
        speaker: speakerDataUri,
        language: "en",
        cleanup_voice: true,
      },
    })
    const audio_url = Array.isArray(output) ? String(output[0]) : String(output)
    return NextResponse.json({ audio_url })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[voice/preview] XTTS-v2 error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
