import { prisma } from "@/lib/db/client"
import { replicate, MODELS, STYLE_HINTS } from "@/lib/replicate/client"
import { fal, FAL_MODELS, languageForVoice, kokoroSpeedForBudget } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { sanitizeVideoPrompt } from "@/lib/ai/moderation"
import { inferSpeakerCharacterId } from "@/lib/scene-routing"
import { chunkPlanForScene } from "@/lib/video/chunk-plan"

// Scene animation submission (extracted from the replicate webhook for D4).
// Given a scene whose keyframe image exists, submit the WAN video job + TTS
// and advance the scene to phase "video". Called from two places:
//   - the replicate webhook, immediately after the keyframe lands (projects
//     without preview approval — the pre-D4 flow, unchanged)
//   - POST /api/scenes/[id]/animate, when the user approves an "image_ready"
//     keyframe (preview-then-render projects)
// `fromPhase` drives the optimistic lock so double-submissions are impossible.

const NEGATIVE_PROMPT = "realistic, photorealistic, live action, real background, real world background, photograph, photography, stock photo, natural landscape, human skin texture, blurry, low quality, static image, frozen frame, still frame, shaky camera, motion blur, camera pan, flickering, nsfw, nudity, nude, explicit, sexual, adult content"

async function toDataUri(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
  const mime = res.headers.get("content-type") ?? "audio/webm"
  return `data:${mime};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`
}

function predRef(modelId: string): { model: `${string}/${string}` } | { version: string } {
  if (modelId.includes(":")) return { version: modelId.split(":").slice(1).join(":") }
  return { model: modelId as `${string}/${string}` }
}

function replicateWebhookConfig() {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base || base.includes("localhost")) return {}
  return {
    webhook: `${base}/api/webhooks/replicate`,
    webhook_events_filter: ["completed"] as ["completed"],
  }
}

export type AnimateResult = { ok: true } | { ok: false; reason: string }

export async function startSceneAnimation(
  sceneId: string,
  opts: { fromPhase: "image" | "image_ready"; imageUrl: string },
): Promise<AnimateResult> {
  const scene = await prisma.scene.findFirst({
    where: { id: sceneId },
    include: { project: { select: {
      characterId: true,
      voiceId: true,
      language: true,
      characters: { orderBy: { orderIndex: "asc" }, include: { character: { select: { id: true, name: true } } } },
    } } },
  })
  if (!scene) return { ok: false, reason: "scene not found" }
  if (scene.generationPhase !== opts.fromPhase) return { ok: false, reason: `scene is in phase ${scene.generationPhase}` }

  const charId = scene.focusCharacterId ?? scene.project.characterId
  // Voice: the SPEAKER character's voice, not the focus character's.
  let voiceCharId = scene.speakerCharacterId ?? null
  if (!voiceCharId) {
    const projectChars = scene.project.characters.map((pc) => pc.character)
    voiceCharId = inferSpeakerCharacterId(scene.voiceScript, projectChars) ?? charId
  }
  const [character, scriptedVoice, projectVoice] = await Promise.all([
    charId ? prisma.character.findUnique({ where: { id: charId } }) : null,
    voiceCharId ? prisma.voice.findFirst({ where: { characterId: voiceCharId } }) : null,
    scene.project.voiceId ? prisma.voice.findUnique({ where: { id: scene.project.voiceId } }) : null,
  ])
  const voice = scriptedVoice ?? projectVoice
  if (!character) return { ok: false, reason: "character not found" }

  const hints = STYLE_HINTS[character.selectedStyle ?? "default"] ?? STYLE_HINTS.default
  const charDesc = character.characterDescription?.trim()
  const ttsText = scene.voiceScript?.trim() || scene.description

  const rawVideoPrompt = scene.videoPrompt?.trim()
    || `${hints.video}, ${charDesc ? charDesc + ", " : ""}${scene.description}, animated cartoon scene, illustrated cartoon background, 2D painted background, smooth natural motion, stable background`
  const videoPrompt = await sanitizeVideoPrompt(rawVideoPrompt)

  const base = process.env.NEXT_PUBLIC_APP_URL
  const webhookSecret = process.env.WEBHOOK_SECRET
  const falWebhookUrl = base && !base.includes("localhost") && webhookSecret
    ? `${base}/api/webhooks/fal?secret=${webhookSecret}`
    : undefined

  // Chunk plan: 6s → 1 chunk; 10s → 2; 15s → 3. First chunk uses the
  // keyframe; subsequent chunks chain via last-frame extraction in the fal
  // webhook.
  const plan = chunkPlanForScene(scene.durationSeconds, scene.voiceScript?.trim() || scene.description)
  const firstChunkFrames = plan.framesPerChunk[0]

  const falSubmit = await fal.queue.submit(FAL_MODELS.wan, {
    input: {
      prompt: videoPrompt,
      image_url: opts.imageUrl,
      negative_prompt: NEGATIVE_PROMPT,
      resolution: "720p",
      aspect_ratio: "16:9",
      guide_scale: 8,
      num_frames: firstChunkFrames,
    },
    ...(falWebhookUrl && { webhookUrl: falWebhookUrl }),
  })

  const kokoroVoice = (voice?.ttsParams as { kokoroVoice?: string } | null)?.kokoroVoice
  const ttsLanguage = kokoroVoice ? languageForVoice(kokoroVoice) : (scene.project.language ?? "en")
  let audioPred: { id: string } | null = null
  let preGeneratedAudioUrl: string | null = null

  if (kokoroVoice && ttsText) {
    try {
      const targetSec = scene.durationSeconds ?? 6
      const speed = kokoroSpeedForBudget(ttsText, targetSec, ttsLanguage)
      const r = await fal.subscribe(FAL_MODELS.kokoro, { input: { text: ttsText, voice: kokoroVoice, language: ttsLanguage, speed } })
      const d = r.data as { audio?: { url: string }; audio_url?: string; audio_file?: { url: string } }
      const rawUrl = d?.audio?.url ?? d?.audio_url ?? d?.audio_file?.url
      if (rawUrl) {
        preGeneratedAudioUrl = await mirrorUrlToBlob(rawUrl, `scenes/${scene.id}/audio.wav`).catch(() => null)
      } else {
        console.error("[animate] kokoro returned no url, response shape:", Object.keys(d ?? {}))
      }
    } catch (e) {
      console.error("[animate] kokoro audio failed:", (e as Error)?.message)
    }
  } else if (voice?.sampleAudioUrl) {
    try {
      const speakerUri = await toDataUri(voice.sampleAudioUrl)
      audioPred = await replicate.predictions.create({
        ...predRef(MODELS.xttsV2),
        input: { text: ttsText, speaker: speakerUri, language: ttsLanguage, cleanup_voice: false },
        ...replicateWebhookConfig(),
      })
    } catch (e) {
      console.error("[animate] audio pred failed:", (e as Error)?.message)
    }
  }

  // Optimistic lock: only transition from the expected phase with no video job.
  const updated = await prisma.scene.updateMany({
    where: { id: scene.id, generationPhase: opts.fromPhase, videoPredictionId: null },
    data: {
      imageUrl: opts.imageUrl,
      generationPhase: "video",
      videoPredictionId: falSubmit.request_id,
      videoChunkCount: plan.framesPerChunk.length,
      videoChunkUrls: [],
      videoPrompt,
      audioPredictionId: audioPred?.id ?? null,
      audioUrl: preGeneratedAudioUrl,
    },
  })
  if (updated.count === 0) {
    console.log(`[animate] scene ${scene.id} already transitioned (race), skipping`)
  }
  return { ok: true }
}
