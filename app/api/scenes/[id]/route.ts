import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS, STYLE_HINTS } from "@/lib/replicate/client"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { sanitizeVideoPrompt } from "@/lib/ai/moderation"

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
    include: { project: { select: { userId: true, characterId: true, voiceId: true } } },
  })

  if (!scene || scene.project.userId !== userId) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 })
  }

  // ── Phase: image prediction running ─────────────────────────────────────
  if (scene.generationPhase === "image" && scene.imagePredictionId && !scene.videoPredictionId) {
    const pred = await replicate.predictions.get(scene.imagePredictionId)

    if (pred.status === "succeeded" && pred.output) {
      const keyframeUrl = Array.isArray(pred.output) ? String(pred.output[0]) : String(pred.output)

      const [character, voice] = await Promise.all([
        scene.project.characterId
          ? prisma.character.findUnique({ where: { id: scene.project.characterId } })
          : null,
        scene.project.voiceId
          ? prisma.voice.findUnique({ where: { id: scene.project.voiceId } })
          : null,
      ])

      if (character) {
        const hints = STYLE_HINTS[character.selectedStyle ?? "default"] ?? STYLE_HINTS.default
        const charDesc = character.characterDescription?.trim()
        const ttsText = scene.voiceScript?.trim() || scene.description

        // Motion keywords: "slow smooth" keeps facial geometry intact and prevents
        // background warping — high motion settings cause style drift on cartoon characters.
        const rawVideoPrompt = `${hints.video}, ${charDesc ? charDesc + ", " : ""}${scene.description}, animated cartoon scene, illustrated cartoon background, 2D painted background, slow smooth motion, gentle movement, stable background`
        const negativePrompt = "realistic, photorealistic, live action, real background, real world background, photograph, photography, stock photo, natural landscape, human skin texture, blurry, low quality, fast motion, sudden movement, shaky camera, motion blur, camera pan, flickering, nsfw, nudity, nude, explicit, sexual, adult content"

        const videoPrompt = await sanitizeVideoPrompt(rawVideoPrompt)

        const projectVoiceId = scene.project.voiceId
        console.log("[scene/poll] image done — voice:", {
          voiceId: projectVoiceId,
          hasSampleUrl: !!voice?.sampleAudioUrl,
          ttsText: ttsText?.slice(0, 80),
        })

        const [falSubmit, audioPred, imageUrl] = await Promise.all([
          fal.queue.submit(FAL_MODELS.wan, {
            input: {
              prompt: videoPrompt,
              image_url: keyframeUrl,
              negative_prompt: negativePrompt,
              resolution: "720p",
              aspect_ratio: "16:9",
              guide_scale: 8,
            },
          }),
          voice?.sampleAudioUrl
            ? toDataUri(voice.sampleAudioUrl)
                .then((speakerUri) =>
                  createPredictionWithRetry({
                    ...predRef(MODELS.xttsV2),
                    input: { text: ttsText, speaker: speakerUri, language: "en", cleanup_voice: true },
                  })
                )
                .then((pred) => { console.log("[scene/poll] audio pred created:", pred.id); return pred })
                .catch((e) => {
                  console.error("[scene/poll] audio pred failed to start:", {
                    error: e?.message ?? String(e),
                    voiceId: projectVoiceId,
                    sampleUrl: voice?.sampleAudioUrl,
                  })
                  return null
                })
            : (console.log("[scene/poll] no voice configured, skipping audio"), Promise.resolve(null)),
          mirrorUrlToBlob(keyframeUrl, `scenes/${id}/frame.jpg`),
        ])

        // Optimistic lock: if webhook already transitioned this scene, skip
        // (avoids duplicate fal.ai submission when both arrive near-simultaneously)
        await prisma.scene.updateMany({
          where: { id, generationPhase: "image", videoPredictionId: null },
          data: {
            imageUrl,
            generationPhase: "video",
            videoPredictionId: falSubmit.request_id,
            audioPredictionId: audioPred?.id ?? null,
          },
        })
      }
    } else if (pred.status === "failed" || pred.status === "canceled") {
      await prisma.scene.update({ where: { id }, data: { generationPhase: "failed" } })
    }

    scene = await prisma.scene.findFirst({
      where: { id },
      include: { project: { select: { userId: true, characterId: true, voiceId: true } } },
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
            data: { videoClipUrl: videoUrl, audioUrl, generationPhase: "done" },
          })

          scene = await prisma.scene.findFirst({
            where: { id },
            include: { project: { select: { userId: true, characterId: true, voiceId: true } } },
          }) ?? scene
        }
      }
    } catch (e) {
      console.error("[scene/poll] video phase error:", (e as Error)?.message)
      await prisma.scene.update({ where: { id }, data: { generationPhase: "failed" } })
      scene = { ...scene, generationPhase: "failed" } as typeof scene
    }
  }

  return NextResponse.json({ scene: sceneShape(scene as Record<string, unknown>) })
}
