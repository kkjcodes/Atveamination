import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { anthropic, BRIEF_MODEL } from "@/lib/ai/client"

// Per-language gender → Kokoro preset map. Picks a sensible default voice for
// each (language, gender) combination so auto-matching works the same way for
// every supported language. Add new languages here when expanding the catalog.
const VOICE_DEFAULTS: Record<string, { male: string; female: string }> = {
  en: { male: "am_michael", female: "af_heart" },
  hi: { male: "hm_omega",   female: "hf_alpha" },
  es: { male: "em_alex",    female: "ef_dora"  },
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const character = await prisma.character.findFirst({ where: { id, userId } })
  if (!character) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Language preference: from query string (?language=hi) or POST body. Defaults
  // to English. Validated against the supported set; unknown codes fall back to en.
  const url = new URL(req.url)
  let lang = (url.searchParams.get("language") ?? "").trim()
  if (!lang) {
    try {
      const body = await req.json() as { language?: string }
      lang = body?.language ?? ""
    } catch {
      // empty/non-JSON body is fine
    }
  }
  if (lang !== "hi" && lang !== "es") lang = "en"
  const defaults = VOICE_DEFAULTS[lang]

  // An existing voice in the right language is reused. Voices in another
  // language are NOT reused — caller asked for `lang`, give them `lang`.
  const existingVoices = await prisma.voice.findMany({ where: { characterId: id, userId } })
  const langPrefix = lang.charAt(0)
  const existingForLang = existingVoices.find((v) => {
    const kv = (v.ttsParams as { kokoroVoice?: string } | null)?.kokoroVoice
    return typeof kv === "string" && kv.startsWith(langPrefix)
  })
  if (existingForLang) return NextResponse.json({ voiceId: existingForLang.id })

  let kokoroVoice = defaults.female
  if (character.selectedStyleUrl) {
    try {
      const imgRes = await fetch(character.selectedStyleUrl)
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
      const mimeType = (imgRes.headers.get("content-type") ?? "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp"

      const msg = await anthropic.messages.create({
        model: BRIEF_MODEL,
        max_tokens: 5,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mimeType, data: imgBuffer.toString("base64") } },
            { type: "text", text: "Reply with exactly one word: 'male' or 'female' based on the apparent gender of the main character in this image." },
          ],
        }],
      })
      const gender = (msg.content[0] as { type: "text"; text: string }).text.trim().toLowerCase()
      kokoroVoice = gender.startsWith("male") ? defaults.male : defaults.female
    } catch (e) {
      console.error("[auto-voice] gender detection failed:", (e as Error)?.message)
    }
  }

  const voice = await prisma.voice.create({
    data: { userId, characterId: id, sampleAudioUrl: null, ttsParams: { kokoroVoice } },
  })

  return NextResponse.json({ voiceId: voice.id, kokoroVoice })
}
