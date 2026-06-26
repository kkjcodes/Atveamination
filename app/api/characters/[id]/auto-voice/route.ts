import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { anthropic, BRIEF_MODEL } from "@/lib/ai/client"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const character = await prisma.character.findFirst({ where: { id, userId } })
  if (!character) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const existing = await prisma.voice.findFirst({ where: { characterId: id, userId } })
  if (existing) return NextResponse.json({ voiceId: existing.id })

  let kokoroVoice = "af_heart"
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
      kokoroVoice = gender.startsWith("male") ? "am_michael" : "af_heart"
    } catch (e) {
      console.error("[auto-voice] gender detection failed:", (e as Error)?.message)
    }
  }

  const voice = await prisma.voice.create({
    data: { userId, characterId: id, sampleAudioUrl: null, ttsParams: { kokoroVoice } },
  })

  return NextResponse.json({ voiceId: voice.id, kokoroVoice })
}
