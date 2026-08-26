import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/client"
import { restoreSceneQuota } from "@/lib/limits"
import { emitSceneTiming } from "@/lib/events"
import { startSceneAnimation } from "@/lib/scenes/animate"
import { replicate, MODELS } from "@/lib/replicate/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { describeFirstFrame } from "@/lib/ai/describe"
import { verifyReplicateSignature } from "@/lib/webhooks/verify"

function predRef(modelId: string): { model: `${string}/${string}` } | { version: string } {
  if (modelId.includes(":")) return { version: modelId.split(":").slice(1).join(":") }
  return { model: modelId as `${string}/${string}` }
}

function webhookConfig() {
  const base = process.env.NEXT_PUBLIC_APP_URL
  if (!base || base.includes("localhost")) return {}
  return {
    webhook: `${base}/api/webhooks/replicate`,
    webhook_events_filter: ["completed"] as ["completed"],
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  if (!verifyReplicateSignature(rawBody, req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = JSON.parse(rawBody) as { id: string; status: string; output?: unknown }
  const { id: predictionId, status, output } = body

  if (status === "failed" || status === "canceled") {
    // Provider-side failure: the user's quota is restored for affected scenes
    // (A3 — failures on our side never count against the daily limit).
    const failedScenes = await prisma.scene.findMany({
      where: {
        OR: [
          { imagePredictionId: predictionId, generationPhase: "image" },
          { audioPredictionId: predictionId },
        ],
      },
      select: { id: true },
    })
    await Promise.all(failedScenes.map((s) => restoreSceneQuota(s.id)))
    await Promise.all([
      prisma.scene.updateMany({
        where: { imagePredictionId: predictionId, generationPhase: "image" },
        data: { generationPhase: "failed" },
      }),
      prisma.scene.updateMany({
        where: { audioPredictionId: predictionId },
        data: { generationPhase: "failed" },
      }),
      // Lip sync failure: graceful fallback — raw video clip is still in videoClipUrl
      prisma.scene.updateMany({
        where: { lipSyncPredictionId: predictionId, generationPhase: "lipsync" },
        data: { generationPhase: "done" },
      }),
    ])
    return NextResponse.json({ ok: true })
  }

  if (status !== "succeeded" || !output) return NextResponse.json({ ok: true })

  // ── Try as image prediction ───────────────────────────────────────────────
  // Condition: generationPhase=image AND videoPredictionId=null prevents
  // double-processing when both polling and webhook arrive near-simultaneously.
  const imageScene = await prisma.scene.findFirst({
    where: { imagePredictionId: predictionId, generationPhase: "image", videoPredictionId: null },
    include: { project: { select: {
      characterId: true,
      voiceId: true,
      language: true,
      previewApproval: true,
      characters: { orderBy: { orderIndex: "asc" }, include: { character: { select: { id: true, name: true } } } },
    } } },
  })

  if (imageScene) {
    try {
      const keyframeUrl = Array.isArray(output) ? String(output[0]) : String(output)
      const imageUrl = await mirrorUrlToBlob(keyframeUrl, `scenes/${imageScene.id}/frame.jpg`)

      // Scene 0 is the visual anchor for all subsequent scenes — capture its
      // clothing/hair/accessory cues so we can inject them into scenes 1-N.
      // Fire-and-forget: stale by 1 scene is acceptable.
      if (imageScene.orderIndex === 0) {
        const projectId = imageScene.projectId
        describeFirstFrame(imageUrl)
          .then(async (desc) => {
            if (desc) await prisma.project.update({ where: { id: projectId }, data: { firstFrameDescription: desc } })
          })
          .catch((e) => console.error("[webhook/replicate] firstFrame describe failed:", (e as Error)?.message))
      }

      if (imageScene.project.previewApproval) {
        // Preview-then-render (D4): stop at the cheap keyframe. The user
        // approves it in the studio, which calls /api/scenes/[id]/animate —
        // video dollars are only spent on approved frames.
        await prisma.scene.updateMany({
          where: { id: imageScene.id, generationPhase: "image", videoPredictionId: null },
          data: { imageUrl, generationPhase: "image_ready" },
        })
      } else {
        // Pre-D4 flow: animate immediately (extracted to lib/scenes/animate).
        const result = await startSceneAnimation(imageScene.id, { fromPhase: "image", imageUrl })
        if (!result.ok) {
          console.error(`[webhook/replicate] animation submit refused: ${result.reason}`)
          if (result.reason === "character not found") {
            await prisma.scene.update({ where: { id: imageScene.id }, data: { generationPhase: "failed" } })
          }
        }
      }
    } catch (e) {
      console.error("[webhook/replicate] image handler error:", (e as Error)?.message)
      await prisma.scene.update({ where: { id: imageScene.id }, data: { generationPhase: "failed" } })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Try as lip sync prediction ────────────────────────────────────────────
  const lipSyncScene = await prisma.scene.findFirst({
    where: { lipSyncPredictionId: predictionId, generationPhase: "lipsync" },
  })
  if (lipSyncScene) {
    try {
      const syncedUrl = Array.isArray(output) ? String(output[0]) : String(output)
      const videoClipUrl = await mirrorUrlToBlob(syncedUrl, `scenes/${lipSyncScene.id}/clip_synced.mp4`)
      await prisma.scene.update({
        where: { id: lipSyncScene.id },
        data: { videoClipUrl, generationPhase: "done" },
      })
      void emitSceneTiming(lipSyncScene.id)
    } catch (e) {
      console.error("[webhook/replicate] lipsync handler error:", (e as Error)?.message)
      // Graceful fallback: raw clip is still in videoClipUrl
      await prisma.scene.update({ where: { id: lipSyncScene.id }, data: { generationPhase: "done" } })
    }
    return NextResponse.json({ ok: true })
  }

  // ── Try as audio prediction ───────────────────────────────────────────────
  const audioScene = await prisma.scene.findFirst({
    where: { audioPredictionId: predictionId },
  })

  if (audioScene) {
    try {
      const rawAudioUrl = Array.isArray(output) ? String(output[0]) : String(output)
      const audioUrl = await mirrorUrlToBlob(rawAudioUrl, `scenes/${audioScene.id}/audio.wav`)
      await prisma.scene.update({ where: { id: audioScene.id }, data: { audioUrl } })
      const fresh = await prisma.scene.findUnique({ where: { id: audioScene.id } })

      if (fresh?.videoClipUrl) {
        // Skip LatentSync entirely on shared (multi-character) scenes — it
        // syncs one face to the audio, leaving the other character's lips
        // animating silently from WAN motion. See fal webhook for full rationale.
        if (fresh.focusCharacterId === null) {
          await prisma.scene.update({ where: { id: audioScene.id }, data: { generationPhase: "done" } })
        } else {
          // Video already arrived — race to claim lip sync submission
          const claimed = await prisma.scene.updateMany({
            where: { id: audioScene.id, lipSyncPredictionId: null, generationPhase: "video" },
            data: { generationPhase: "lipsync" },
          })
          if (claimed.count > 0) {
            try {
              const pred = await replicate.predictions.create({
                ...predRef(MODELS.latentSync),
                input: { video: fresh.videoClipUrl, audio: audioUrl },
                ...webhookConfig(),
              })
              await prisma.scene.update({ where: { id: audioScene.id }, data: { lipSyncPredictionId: pred.id } })
            } catch (lipSyncErr) {
              console.error("[webhook/replicate] lipsync submit failed, falling back to raw clip:", (lipSyncErr as Error)?.message)
              await prisma.scene.update({ where: { id: audioScene.id }, data: { generationPhase: "done" } })
            }
          }
        }
      }
      // else: video still pending — fal webhook will submit lip sync when video arrives
    } catch (e) {
      console.error("[webhook/replicate] audio handler error:", (e as Error)?.message)
    }
  }

  return NextResponse.json({ ok: true })
}
