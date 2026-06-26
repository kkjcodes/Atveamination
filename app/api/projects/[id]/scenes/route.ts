import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { shouldForceShared, inferSpeakerCharacterId } from "@/lib/scene-routing"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const project = await prisma.project.findFirst({
    where: { id, userId },
    include: {
      characters: {
        orderBy: { orderIndex: "asc" },
        include: { character: { select: { id: true, name: true } } },
      },
    },
  })
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 })
  }

  const { scenes } = (await req.json()) as {
    scenes: Array<{
      description: string
      voice_script?: string
      order_index: number
      duration_seconds: number
      focus_character_id?: string | null
      speaker_character_id?: string | null
      // Accept either field for the speaker — name resolves to an ID against
      // the project's characters. Lets the test script + brief endpoint pass
      // the LLM's "speaker" output without resolving on the client.
      speaker_name?: string | null
    }>
  }

  if (!Array.isArray(scenes) || scenes.length === 0) {
    return NextResponse.json({ error: "scenes array is required" }, { status: 400 })
  }

  // Defensive routing: force shared (focus=null → Multi-Kontext) when a scene
  // describes multiple characters or has relational cues, regardless of what
  // the caller sent. Keeps single-character LoRA paths from duplicating into
  // multi-character output. Single-character projects opt out automatically
  // (no shared mode possible).
  const projectChars = project.characters.map((pc) => pc.character)
  const charNames = projectChars.map((c) => c.name)
  const charIds = new Set(projectChars.map((c) => c.id))

  // Only CREATE new scenes — never delete existing ones.
  // Callers are responsible for only sending scenes that don't yet have a DB record.
  await prisma.scene.createMany({
    data: scenes.map((s) => {
      const callerFocus = s.focus_character_id ?? null
      const forceShared = shouldForceShared(s.description, charNames)
      const focusCharacterId = forceShared
        ? null
        : (callerFocus && charIds.has(callerFocus)) ? callerFocus : null

      // Resolve speaker: explicit id > explicit name > infer from voiceScript.
      let speakerCharacterId: string | null = null
      if (s.speaker_character_id && charIds.has(s.speaker_character_id)) {
        speakerCharacterId = s.speaker_character_id
      } else if (s.speaker_name) {
        const matched = projectChars.find((c) => c.name.toLowerCase() === s.speaker_name!.toLowerCase())
        speakerCharacterId = matched?.id ?? null
      }
      if (!speakerCharacterId) {
        speakerCharacterId = inferSpeakerCharacterId(s.voice_script, projectChars)
      }

      return {
        projectId: id,
        description: s.description,
        voiceScript: s.voice_script ?? null,
        orderIndex: s.order_index,
        durationSeconds: s.duration_seconds,
        focusCharacterId,
        speakerCharacterId,
      }
    }),
  })

  // Return the newly created scenes, identified by their orderIndex values.
  const orderIndexes = scenes.map((s) => s.order_index)
  const created = await prisma.scene.findMany({
    where: { projectId: id, orderIndex: { in: orderIndexes } },
    orderBy: { orderIndex: "asc" },
  })

  return NextResponse.json({ scenes: created })
}
