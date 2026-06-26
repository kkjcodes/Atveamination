import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { anthropic, BRIEF_MODEL } from "@/lib/ai/client"
import { checkBriefLimit, logUsage } from "@/lib/limits"

type GeneratedScene = {
  description: string
  voice_script: string
  duration_seconds: 5 | 10 | 15
  // Which character actually delivers the voice_script line. Used downstream to
  // pick the right per-character voice (Kumar's lines play in Kumar's voice).
  // Optional — for single-character projects we infer from the cast.
  speaker?: string
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const briefLimit = await checkBriefLimit(userId)
  if (!briefLimit.allowed) {
    return NextResponse.json(
      { error: "Daily brief generation limit reached.", used: briefLimit.used, limit: briefLimit.limit, resetsAt: briefLimit.resetsAt },
      { status: 429 }
    )
  }

  const { brief, style, num_scenes, character_names } = await req.json()
  if (!brief?.trim()) return NextResponse.json({ error: "brief is required" }, { status: 400 })

  const numScenes = Math.max(1, Math.min(10, Number(num_scenes) || 5))
  const styleLabel = style ?? "cartoon animation"
  const names: string[] = Array.isArray(character_names) ? character_names : []
  const castLine = names.length > 1
    ? `Cast: ${names.join(", ")}. Scenes should feature these characters — some scenes focus on one character, others show them together.`
    : names.length === 1
      ? `Main character: ${names[0]}.`
      : ""

  const message = await anthropic.messages.create({
    model: BRIEF_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `You are a creative director for an animated ${styleLabel} short video.

Expand this brief into exactly ${numScenes} scenes for an AI video generator.
${castLine}

BRIEF: "${brief.trim()}"

For each scene write:
- description (2-3 sentences): vivid, specific visual details — the character's pose and action, the setting, lighting, mood. Be concrete and visual, not abstract. When multiple characters are present, name them in the description.
- voice_script (1-2 short sentences): what the character says or narrates, natural and conversational tone.
- speaker: ${names.length > 1 ? `which character delivers the voice_script line — must be one of: ${names.join(", ")}. Choose the character whose dialogue this is. For narration with no clear speaker, choose the most prominent character in the scene.` : `omit this field, single-character project.`}
- duration_seconds: 5 (quick moment), 10 (standard action), or 15 (longer sequence with more happening).

Return ONLY a valid JSON array, no markdown fences or extra text:
[{"description":"...","voice_script":"...","speaker":"...","duration_seconds":5}]`,
      },
    ],
  })

  const raw = message.content[0].type === "text" ? message.content[0].text.trim() : ""
  const json = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim()

  let scenes: GeneratedScene[]
  try {
    scenes = JSON.parse(json)
  } catch {
    console.error("[generate-brief] failed to parse:", raw.slice(0, 200))
    return NextResponse.json({ error: "AI returned an unexpected format. Please try again." }, { status: 500 })
  }

  await logUsage(userId, "brief_generate", "brief", "brief")
  return NextResponse.json({ scenes })
}
