import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS, STYLE_HINTS } from "@/lib/replicate/client"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { sanitizeVideoPrompt } from "@/lib/ai/moderation"
import { describeFirstFrame } from "@/lib/ai/describe"
import { inferSpeakerCharacterId } from "@/lib/scene-routing"
import { logError } from "@/lib/logger"

async function createPredictionWithRetry(
  args: Parameters<typeof replicate.predictions.create>[0],
  maxRetries = 3
): Promise<{ id: string }> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await replicate.predictions.create(args)
    } catch (e) {
      const msg = (e as Error)?.message ?? ""
      const is429 = msg.includes("429") || msg.includes("Too Many Requests")
      if (!is429 || attempt === maxRetries - 1) throw e
      const retryAfterMatch = msg.match(/"retry_after"\s*:\s*(\d+(?:\.\d+)?)/)
      const waitMs = retryAfterMatch ? (Number(retryAfterMatch[1]) + 1) * 1000 : 2000
      console.warn(`[scene/poll] audio 429, retrying in ${waitMs}ms (attempt ${attempt + 1}/${maxRetries})`)
      await new Promise((r) => setTimeout(r, waitMs))
    }
  }
  throw new Error("Max retries exceeded")
}

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

function sceneShape(scene: Record<string, unknown>) {
  return {
    id: scene.id,
    project_id: scene.projectId,
    order_index: scene.orderIndex,
    description: scene.description,
    voice_script: scene.voiceScript,
    generation_phase: scene.generationPhase,
    image_url: scene.imageUrl,
    audio_url: scene.audioUrl,
    video_clip_url: scene.videoClipUrl,
    duration_seconds: scene.durationSeconds,
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scene = await prisma.scene.findFirst({
    where: { id },
    include: { project: { select: { userId: true } } },
  })
  if (!scene || scene.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 })
  }

  const body = await req.json() as { description?: string; voiceScript?: string | null; durationSeconds?: number }
  await prisma.scene.update({
    where: { id },
    data: {
      ...(body.description !== undefined && { description: body.description }),
      ...(body.voiceScript !== undefined && { voiceScript: body.voiceScript }),
      ...(body.durationSeconds !== undefined && { durationSeconds: body.durationSeconds }),
    },
  })

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const scene = await prisma.scene.findFirst({
    where: { id },
    include: { project: { select: { userId: true } } },
  })
  if (!scene || scene.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 })
  }

  await prisma.scene.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  let scene = await prisma.scene.findFirst({
    where: { id },
    include: { project: { select: {
      userId: true, characterId: true, voiceId: true,
      characters: { orderBy: { orderIndex: "asc" }, include: { character: { select: { id: true, name: true } } } },
    } } },
  })

  if (!scene || scene.project.userId !== userId) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 })
  }

  // ── Phase: image prediction running ─────────────────────────────────────
  if (scene.generationPhase === "image" && scene.imagePredictionId && !scene.videoPredictionId) {
    let keyframeUrl: string | null = null
    let imageFailed = false

    if (scene.imagePredictionId.startsWith("falmk:")) {
      // Multi-Kontext (shared multi-character scene)
      const falRequestId = scene.imagePredictionId.slice(6)
      const status = await fal.queue.status(FAL_MODELS.kontextMulti, { requestId: falRequestId, logs: false })
      if ((status.status as string) === "COMPLETED") {
        const result = await fal.queue.result(FAL_MODELS.kontextMulti, { requestId: falRequestId })
        keyframeUrl = (result.data as { images: Array<{ url: string }> }).images?.[0]?.url ?? null
      } else if ((status.status as string) === "FAILED") {
        imageFailed = true
      }
    } else if (scene.imagePredictionId.startsWith("fal:")) {
      // Flux + LoRA inference (fal-trained character path)
      const falRequestId = scene.imagePredictionId.slice(4)
      const status = await fal.queue.status(FAL_MODELS.fluxLora, { requestId: falRequestId, logs: false })
      if ((status.status as string) === "COMPLETED") {
        const result = await fal.queue.result(FAL_MODELS.fluxLora, { requestId: falRequestId })
        keyframeUrl = (result.data as { images: Array<{ url: string }> }).images?.[0]?.url ?? null
      } else if ((status.status as string) === "FAILED") {
        imageFailed = true
      }
    } else {
      const pred = await replicate.predictions.get(scene.imagePredictionId)
      if (pred.status === "succeeded" && pred.output) {
        keyframeUrl = Array.isArray(pred.output) ? String(pred.output[0]) : String(pred.output)
      } else if (pred.status === "failed" || pred.status === "canceled") {
        imageFailed = true
      }
    }

    if (imageFailed) {
      await prisma.scene.update({ where: { id }, data: { generationPhase: "failed" } })
    } else if (keyframeUrl) {
      const charId = scene.focusCharacterId ?? scene.project.characterId
      // Voice: prefer the SPEAKER character's voice (separate field from focus —
      // a scene focused on Kirti can have Kumar as the speaker if he's
      // delivering the line). If speakerCharacterId wasn't set at save time,
      // infer it from voiceScript ("Kirti, will you..." → other character speaks).
      let voiceCharId = scene.speakerCharacterId ?? null
      if (!voiceCharId) {
        const projectChars = scene.project.characters.map((pc) => pc.character)
        voiceCharId = inferSpeakerCharacterId(scene.voiceScript, projectChars) ?? charId
      }
      const [character, scriptedVoice, projectVoice] = await Promise.all([
        charId ? prisma.character.findUnique({ where: { id: charId } }) : null,
        voiceCharId ? prisma.voice.findFirst({ where: { characterId: voiceCharId } }) : null,
        scene.project.voiceId
          ? prisma.voice.findUnique({ where: { id: scene.project.voiceId } })
          : null,
      ])
      const voice = scriptedVoice ?? projectVoice

      if (character) {
        const hints = STYLE_HINTS[character.selectedStyle ?? "default"] ?? STYLE_HINTS.default
        const charDesc = character.characterDescription?.trim()
        const ttsText = scene.voiceScript?.trim() || scene.description

        // Motion keywords: "slow smooth" keeps facial geometry intact and prevents
        // background warping — high motion settings cause style drift on cartoon characters.
        const rawVideoPrompt = `${hints.video}, ${charDesc ? charDesc + ", " : ""}${scene.description}, animated cartoon scene, illustrated cartoon background, 2D painted background, slow smooth motion, gentle movement, stable background`
        const negativePrompt = "realistic, photorealistic, live action, real background, real world background, photograph, photography, stock photo, natural landscape, human skin texture, blurry, low quality, fast motion, sudden movement, shaky camera, motion blur, camera pan, flickering, nsfw, nudity, nude, explicit, sexual, adult content"

        const videoPrompt = await sanitizeVideoPrompt(rawVideoPrompt)

        const kokoroVoice = (voice?.ttsParams as { kokoroVoice?: string } | null)?.kokoroVoice
        const projectVoiceId = scene.project.voiceId
        console.log("[scene/poll] image done — voice:", {
          voiceId: projectVoiceId,
          kokoroVoice: kokoroVoice ?? null,
          hasSampleUrl: !!voice?.sampleAudioUrl,
          ttsText: ttsText?.slice(0, 80),
        })

        const [falSubmit, imageUrl] = await Promise.all([
          fal.queue.submit(FAL_MODELS.wan, {
            input: {
              prompt: videoPrompt,
              image_url: keyframeUrl,
              negative_prompt: negativePrompt,
              resolution: "720p",
              aspect_ratio: "16:9",
              guide_scale: 8,
              // fal-ai/wan-i2v caps at 100 frames (~6s at 16fps).
              // Always request the maximum so users get the longest possible clip.
              num_frames: 100,
            },
          }),
          mirrorUrlToBlob(keyframeUrl, `scenes/${id}/frame.jpg`),
        ])

        // Capture scene 0's visual cues for use by subsequent scenes. Fire-and-forget.
        if (scene.orderIndex === 0) {
          const projectId = scene.projectId
          describeFirstFrame(imageUrl)
            .then(async (desc) => {
              if (desc) await prisma.project.update({ where: { id: projectId }, data: { firstFrameDescription: desc } })
            })
            .catch((e) => console.error("[scene/poll] firstFrame describe failed:", (e as Error)?.message))
        }

        let audioUrl: string | null = null
        let audioPredId: string | null = null

        if (kokoroVoice && ttsText) {
          try {
            const r = await fal.subscribe(FAL_MODELS.kokoro, { input: { text: ttsText, voice: kokoroVoice } })
            const d = r.data as { audio?: { url: string }; audio_url?: string; audio_file?: { url: string } }
            const rawUrl = d?.audio?.url ?? d?.audio_url ?? d?.audio_file?.url
            if (rawUrl) {
              audioUrl = await mirrorUrlToBlob(rawUrl, `scenes/${id}/audio.wav`).catch(() => null)
            } else {
              console.error("[scene/poll] kokoro returned no url, response shape:", Object.keys(d ?? {}))
            }
            console.log("[scene/poll] kokoro audio done:", audioUrl?.slice(0, 80))
          } catch (e) {
            console.error("[scene/poll] kokoro audio failed:", (e as Error)?.message)
          }
        } else if (voice?.sampleAudioUrl) {
          try {
            const speakerUri = await toDataUri(voice.sampleAudioUrl)
            const pred = await createPredictionWithRetry({
              ...predRef(MODELS.xttsV2),
              input: { text: ttsText, speaker: speakerUri, language: "en", cleanup_voice: false },
            })
            console.log("[scene/poll] audio pred created:", pred.id)
            audioPredId = pred.id
          } catch (e) {
            console.error("[scene/poll] audio pred failed to start:", {
              error: (e as Error)?.message ?? String(e),
              voiceId: projectVoiceId,
              sampleUrl: voice?.sampleAudioUrl,
            })
          }
        } else {
          console.log("[scene/poll] no voice configured, skipping audio")
        }

        // Optimistic lock: if webhook already transitioned this scene, skip
        // (avoids duplicate fal.ai submission when both arrive near-simultaneously)
        await prisma.scene.updateMany({
          where: { id, generationPhase: "image", videoPredictionId: null },
          data: {
            imageUrl,
            generationPhase: "video",
            videoPredictionId: falSubmit.request_id,
            audioPredictionId: audioPredId,
            audioUrl,
          },
        })
      }
    }

    scene = await prisma.scene.findFirst({
      where: { id },
      include: { project: { select: { userId: true, characterId: true, voiceId: true, characters: { orderBy: { orderIndex: "asc" }, include: { character: { select: { id: true, name: true } } } } } } },
    }) ?? scene
  }

  // ── Phase: video (+ optional audio) prediction running ──────────────────
  if (scene.generationPhase === "video" && scene.videoPredictionId) {
    try {
      const [videoStatus, audioPred] = await Promise.all([
        fal.queue.status(FAL_MODELS.wan, { requestId: scene.videoPredictionId, logs: false }),
        scene.audioPredictionId ? replicate.predictions.get(scene.audioPredictionId) : null,
      ])

      console.log("[scene/poll] video status:", videoStatus.status, "| audio pred:", {
        id: scene.audioPredictionId,
        status: audioPred?.status ?? "none",
        hasOutput: !!audioPred?.output,
      })

      if (videoStatus.status === "COMPLETED") {
        const audioReady = !audioPred || audioPred.status === "succeeded" || audioPred.status === "failed"

        if (!audioReady) {
          console.log("[scene/poll] waiting for audio pred to finish:", audioPred?.status)
        }

        if (audioReady) {
          const videoResult = await fal.queue.result(FAL_MODELS.wan, { requestId: scene.videoPredictionId })
          const rawVideo = (videoResult.data as { video: { url: string } }).video.url

          // Mirror audio immediately; video will be mirrored after vision enhancement
          let audioUrl: string | null = null
          if (audioPred?.status === "succeeded" && audioPred.output) {
            const rawAudioUrl = Array.isArray(audioPred.output)
              ? String(audioPred.output[0])
              : String(audioPred.output)
            console.log("[scene/poll] mirroring audio:", rawAudioUrl.slice(0, 80))
            audioUrl = await mirrorUrlToBlob(rawAudioUrl, `scenes/${id}/audio.wav`).catch((e) => {
              console.error("[scene/poll] audio mirror failed:", e?.message)
              return null
            })
            console.log("[scene/poll] audio mirrored:", audioUrl)
          } else if (audioPred) {
            console.log("[scene/poll] audio pred did not succeed:", audioPred.status, audioPred.error)
          }

          const videoUrl = await mirrorUrlToBlob(rawVideo, `scenes/${id}/clip.mp4`)
          await prisma.scene.update({
            where: { id },
            data: { videoClipUrl: videoUrl, audioUrl: audioUrl ?? scene.audioUrl ?? null, generationPhase: "done" },
          })

          scene = await prisma.scene.findFirst({
            where: { id },
            include: { project: { select: { userId: true, characterId: true, voiceId: true, characters: { orderBy: { orderIndex: "asc" }, include: { character: { select: { id: true, name: true } } } } } } },
          }) ?? scene
        }
      }
    } catch (e) {
      logError("/api/scenes/[id]", "video_phase_poll", { sceneId: id, userId, videoPredictionId: scene.videoPredictionId, audioPredictionId: scene.audioPredictionId }, e)
      await prisma.scene.update({ where: { id }, data: { generationPhase: "failed" } })
      scene = { ...scene, generationPhase: "failed" } as typeof scene
    }
  }

  return NextResponse.json({ scene: sceneShape(scene as Record<string, unknown>) })
}
