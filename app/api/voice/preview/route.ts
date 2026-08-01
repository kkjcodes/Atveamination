import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { replicate, MODELS } from "@/lib/replicate/client"
import { validateAudioFile, UploadValidationError } from "@/lib/business/upload"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await req.formData()
  const audio = form.get("audio") as File | null
  const text = form.get("text") as string | null
  const rawLanguage = (form.get("language") as string | null)?.trim()
  const language = rawLanguage === "hi" || rawLanguage === "es" ? rawLanguage : "en"

  if (!audio || !text?.trim()) {
    return NextResponse.json({ error: "audio and text are required" }, { status: 400 })
  }
  try {
    validateAudioFile(audio)
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  const buffer = Buffer.from(await audio.arrayBuffer())
  const mime = audio.type || "audio/webm"
  const speakerDataUri = `data:${mime};base64,${buffer.toString("base64")}`

  try {
    const output = await replicate.run(MODELS.xttsV2, {
      input: {
        text,
        speaker: speakerDataUri,
        language,
        cleanup_voice: false,
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
