import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/client"
import { restoreSceneQuota } from "@/lib/limits"
import { emitSceneTiming } from "@/lib/events"
import { replicate, MODELS } from "@/lib/replicate/client"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { verifyFalSecret } from "@/lib/webhooks/verify"
import { chunkPlanForScene } from "@/lib/video/chunk-plan"
import { extractLastFrame } from "@/lib/video/extract-last-frame"
import { finalizeChunks } from "@/lib/video/finalize-chunks"
import { runQcAndFinalize } from "@/lib/scrapbook/finalize"

// Handle a LoRA training completion webhook. The training endpoint tags its
// webhook URL with `?kind=lora_training` — that plus the Job.type lookup
// disambiguates from scene/scrapbook predictions without prefix trickery.
async function handleTrainingCompletion(requestId: string, body: {
  status?: string
  error?: string
  payload?: { diffusers_lora_file?: { url: string } }
}): Promise<NextResponse> {
  const job = await prisma.job.findFirst({
    where: { replicatePredictionId: requestId, type: "lora_training_fal" },
  })
  if (!job) {
    console.log("[webhook/fal] training webhook for unknown job:", requestId)
    return NextResponse.json({ ok: true })
  }

  if (body.status === "ERROR" || body.error) {
    await Promise.all([
      prisma.character.updateMany({
        where: { id: job.entityId },
        data: {
          loraTrainingStatus: "failed",
          trainStartedAt: null,
          trainFailureCode: "provider_error",
          trainFailureMessage: "Training didn't finish. You can start it again.",
        },
      }),
      prisma.job.update({ where: { id: job.id }, data: { status: "failed" } }),
    ])
    console.error("[webhook/fal] training FAILED for character", job.entityId, "error:", body.error)
    return NextResponse.json({ ok: true })
  }

  // Fetch the full result (webhook payload doesn't always include the LoRA URL).
  let loraUrl: string | undefined
  try {
    const result = await fal.queue.result(FAL_MODELS.loraTraining, { requestId })
    loraUrl = (result.data as { diffusers_lora_file?: { url: string } })?.diffusers_lora_file?.url
  } catch (e) {
    console.error("[webhook/fal] fetch training result failed:", (e as Error)?.message)
  }
  if (!loraUrl) loraUrl = body.payload?.diffusers_lora_file?.url

  if (!loraUrl) {
    // Fal reported completion but no LoRA URL — mark failed so users can retry.
    await Promise.all([
      prisma.character.updateMany({
        where: { id: job.entityId },
        data: {
          loraTrainingStatus: "failed",
          trainStartedAt: null,
          trainFailureCode: "provider_error",
          trainFailureMessage: "Training didn't finish. You can start it again.",
        },
      }),
      prisma.job.update({ where: { id: job.id }, data: { status: "failed" } }),
    ])
    console.error("[webhook/fal] training completed but no LoRA URL for", job.entityId)
    return NextResponse.json({ ok: true })
  }

  // Mirror the fal.media LoRA to our blob so the URL doesn't expire.
  const mirroredUrl = await mirrorUrlToBlob(
    loraUrl,
    `characters/${job.entityId}/lora.safetensors`,
  ).catch((e) => {
    console.error("[webhook/fal] LoRA mirror failed, using fal URL:", (e as Error)?.message)
    return loraUrl!
  })

  await Promise.all([
    prisma.character.updateMany({
      where: { id: job.entityId },
      data: {
        loraVersion: mirroredUrl,
        loraTrainingStatus: "succeeded",
        trainStartedAt: null,
        trainFailureCode: null,
        trainFailureMessage: null,
      },
    }),
    prisma.job.update({
      where: { id: job.id },
      data: { status: "succeeded", result: { loraUrl: mirroredUrl } },
    }),
  ])
  console.log("[webhook/fal] training SUCCEEDED for character", job.entityId)
  return NextResponse.json({ ok: true })
}

async function submitLipSync(sceneId: string, videoUrl: string, audioUrl: string): Promise<void> {
  const base = process.env.NEXT_PUBLIC_APP_URL
  const webhookOpts = base && !base.includes("localhost")
    ? { webhook: `${base}/api/webhooks/replicate`, webhook_events_filter: ["completed"] as ["completed"] }
    : {}
  try {
    const pred = await replicate.predictions.create({
      model: MODELS.latentSync as `${string}/${string}`,
      input: { video: videoUrl, audio: audioUrl },
      ...webhookOpts,
    })
    await prisma.scene.update({ where: { id: sceneId }, data: { lipSyncPredictionId: pred.id } })
  } catch (e) {
    console.error("[webhook/fal] lipsync submit failed, falling back to raw clip:", (e as Error)?.message)
    await prisma.scene.update({ where: { id: sceneId }, data: { generationPhase: "done" } })
    void emitSceneTiming(sceneId)
  }
}

// Kick off the next WAN chunk seeded by the last frame of the just-completed
// chunk. Returns the new fal request_id (which becomes the scene's active
// videoPredictionId). Reuses the sanitized videoPrompt cached at chunk-1 time
// so all chunks share the same instruction to WAN.
async function submitNextChunk(
  sceneId: string,
  prevChunkUrl: string,
  chunkIndex: number,
  framesForNextChunk: number,
  prompt: string,
): Promise<string> {
  const seedFrameUrl = await extractLastFrame(prevChunkUrl, sceneId, chunkIndex)
  const negativePrompt = "realistic, photorealistic, live action, real background, real world background, photograph, photography, stock photo, natural landscape, human skin texture, blurry, low quality, static image, frozen frame, still frame, shaky camera, motion blur, camera pan, flickering, nsfw, nudity, nude, explicit, sexual, adult content"
  const base = process.env.NEXT_PUBLIC_APP_URL
  const webhookSecret = process.env.WEBHOOK_SECRET
  const falWebhookUrl = base && !base.includes("localhost") && webhookSecret
    ? `${base}/api/webhooks/fal?secret=${webhookSecret}`
    : undefined

  const submit = await fal.queue.submit(FAL_MODELS.wan, {
    input: {
      prompt,
      image_url: seedFrameUrl,
      negative_prompt: negativePrompt,
      resolution: "720p",
      aspect_ratio: "16:9",
      guide_scale: 8,
      num_frames: framesForNextChunk,
    },
    ...(falWebhookUrl && { webhookUrl: falWebhookUrl }),
  })
  return submit.request_id
}


export async function POST(req: NextRequest) {
  if (!verifyFalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null) as {
    request_id?: string
    status?: string
    payload?: { video?: { url: string }; diffusers_lora_file?: { url: string } }
    error?: string
  } | null
  if (!body) {
    console.warn("[webhook/fal] non-JSON body received")
    return NextResponse.json({ ok: true })
  }

  const requestId = body.request_id
  const videoUrl = body.payload?.video?.url
  // Test mocks pass a plain Request (no .nextUrl), so parse from req.url instead.
  const kind = (() => {
    try { return new URL(req.url).searchParams.get("kind") } catch { return null }
  })()

  console.log("[webhook/fal] received:", { requestId, kind, status: body.status, hasVideo: !!videoUrl })

  if (!requestId) {
    console.warn("[webhook/fal] no request_id in body")
    return NextResponse.json({ ok: true })
  }

  // LoRA training dispatch — tagged via ?kind=lora_training on the webhook URL.
  if (kind === "lora_training") {
    return handleTrainingCompletion(requestId, body)
  }

  // ── Scrapbook page path (WAN FLF2V for dynamic route) ───────────────────
  // ScrapbookPage.motionPredictionId is stored as "sb:<requestId>" so we
  // can distinguish it from scene predictions without a full-scan.
  const scrapbookPredId = `sb:${requestId}`

  if (body.status === "ERROR" || body.error) {
    // Mark matching scrapbook page as fallback (Ken Burns), and any Scene as failed.
    // generationStartedAt cleared here — this IS the terminal state for the
    // dynamic route. Without it the row would remain "processing"-ish with a
    // stale timestamp and next POST would submit duplicate fal work.
    const [scrapMarked] = await Promise.all([
      prisma.scrapbookPage.updateMany({
        where: { motionPredictionId: scrapbookPredId },
        data: {
          generationPhase: "done",
          usedFallback: true,
          qcResult: { passed: false, reason: "WAN FLF2V failed", metrics: {} } as unknown as object,
          generationStartedAt: null,
          generationFailureCode: "provider_error",
          generationFailureMessage: "The AI couldn't animate this scene. We fell back to a gentle still-photo motion.",
        },
      }),
      prisma.scene.findMany({ where: { videoPredictionId: requestId }, select: { id: true } })
        .then((scenes) => Promise.all(scenes.map((s) => restoreSceneQuota(s.id))))
        .then(() => prisma.scene.updateMany({
          where: { videoPredictionId: requestId },
          data: { generationPhase: "failed" },
        })),
    ])
    void scrapMarked
    return NextResponse.json({ ok: true })
  }

  if (!videoUrl) return NextResponse.json({ ok: true })

  // Look up scrapbook page first — cheap indexed hit; scene lookup only if miss.
  const scrapbookPage = await prisma.scrapbookPage.findFirst({
    where: { motionPredictionId: scrapbookPredId },
    include: { project: { select: { id: true } } },
  })
  if (scrapbookPage) {
    try {
      const rawClipUrl = await mirrorUrlToBlob(
        videoUrl,
        `scrapbook/${scrapbookPage.project.id}/pages/${scrapbookPage.orderIndex}/raw_clip.mp4`,
      )
      await prisma.scrapbookPage.update({
        where: { id: scrapbookPage.id },
        data: { rawClipUrl, generationPhase: "qc" },
      })
      await runQcAndFinalize(scrapbookPage.id, rawClipUrl, scrapbookPage.beforeKeyframeUrl)
    } catch (e) {
      console.error("[webhook/fal] scrapbook page handler error:", (e as Error)?.message)
      await prisma.scrapbookPage.update({
        where: { id: scrapbookPage.id },
        data: {
          generationPhase: "done",
          usedFallback: true,
          qcResult: { passed: false, reason: "webhook handler crashed", metrics: {} } as unknown as object,
          generationStartedAt: null,
          generationFailureCode: "internal",
          generationFailureMessage: "We couldn't process the AI's response. Your page uses a gentle still-photo motion instead.",
        },
      })
    }
    return NextResponse.json({ ok: true })
  }

  const scene = await prisma.scene.findFirst({
    where: { videoPredictionId: requestId },
  })
  if (!scene) return NextResponse.json({ ok: true })

  try {
    const chunkCount = scene.videoChunkCount ?? 1
    const priorChunkUrls = Array.isArray(scene.videoChunkUrls)
      ? (scene.videoChunkUrls as string[])
      : []
    const chunkIndex = priorChunkUrls.length  // 0-based index of the chunk that JUST completed

    // Mirror this chunk to blob under a stable per-index path.
    const chunkBlobPath = chunkCount === 1
      ? `scenes/${scene.id}/clip.mp4`
      : `scenes/${scene.id}/chunk_${chunkIndex}.mp4`
    const chunkClipUrl = await mirrorUrlToBlob(videoUrl, chunkBlobPath)
    const updatedChunkUrls = [...priorChunkUrls, chunkClipUrl]

    const hasMoreChunks = chunkIndex + 1 < chunkCount

    if (hasMoreChunks) {
      // ── Advance: extract last frame, submit next chunk, return. ─────────────
      // Audio finalization waits for the FINAL chunk; do nothing else here.
      const plan = chunkPlanForScene(scene.durationSeconds, scene.voiceScript?.trim() || scene.description)
      const framesNext = plan.framesPerChunk[chunkIndex + 1]
      if (!scene.videoPrompt) {
        console.error("[webhook/fal] chunk-advance failed: no videoPrompt cached on scene", scene.id)
        await prisma.scene.update({ where: { id: scene.id }, data: { generationPhase: "failed" } })
        return NextResponse.json({ ok: true })
      }
      try {
        const nextRequestId = await submitNextChunk(scene.id, chunkClipUrl, chunkIndex, framesNext, scene.videoPrompt)
        await prisma.scene.update({
          where: { id: scene.id },
          data: {
            videoChunkUrls: updatedChunkUrls,
            videoPredictionId: nextRequestId,
          },
        })
        return NextResponse.json({ ok: true })
      } catch (chainErr) {
        // Chain broke. Rather than failing hard, deliver what we have as the
        // final video (shorter than requested but working). Fall through to
        // the finalize + audio logic with the truncated chunk set.
        console.error("[webhook/fal] chunk-advance submit failed, finalizing early:", (chainErr as Error)?.message)
      }
    }

    // ── Finalize: single-chunk, all chunks arrived, or chain broke mid-way ──
    const targetSeconds = chunkCount === 1
      ? chunkPlanForScene(scene.durationSeconds, scene.voiceScript?.trim() || scene.description).targetSeconds
      : updatedChunkUrls.length === chunkCount
        ? chunkPlanForScene(scene.durationSeconds, scene.voiceScript?.trim() || scene.description).targetSeconds
        : updatedChunkUrls.length * 6  // truncated by chain failure
    const finalVideoUrl = chunkCount === 1
      ? chunkClipUrl
      : await finalizeChunks(scene.id, updatedChunkUrls, targetSeconds)

    await prisma.scene.update({
      where: { id: scene.id },
      data: {
        videoChunkUrls: updatedChunkUrls,
        videoClipUrl: finalVideoUrl,
      },
    })
    const fresh = await prisma.scene.findUnique({ where: { id: scene.id } })
    if (!fresh) return NextResponse.json({ ok: true })

    if (!fresh.audioPredictionId && !fresh.audioUrl) {
      // No audio at all — mark done immediately
      await prisma.scene.update({ where: { id: scene.id }, data: { generationPhase: "done" } })
    } else if (fresh.audioUrl) {
      // LatentSync targets a single face. On shared (multi-character) scenes it
      // picks one face and syncs to whichever voice happens to be playing —
      // making the other character's mouth animate silently from WAN motion,
      // which reads as "lips moving with no audio." Skip lip sync entirely for
      // shared scenes; the raw WAN clip + Kokoro audio sounds fine even without
      // synced lips, since the lips weren't going to match in either case.
      if (fresh.focusCharacterId === null) {
        await prisma.scene.update({ where: { id: scene.id }, data: { generationPhase: "done" } })
      } else {
        // Audio ready — race to claim lip sync (optimistic lock against the
        // replicate webhook racing on the same scene)
        const claimed = await prisma.scene.updateMany({
          where: { id: scene.id, lipSyncPredictionId: null, generationPhase: "video" },
          data: { generationPhase: "lipsync" },
        })
        if (claimed.count > 0) {
          await submitLipSync(scene.id, finalVideoUrl, fresh.audioUrl)
        }
      }
    }
    // else: XTTS audio pending (audioPredictionId set, audioUrl null) — replicate webhook handles lip sync
  } catch (e) {
    console.error("[webhook/fal] error:", (e as Error)?.message)
    await prisma.scene.updateMany({
      where: { videoPredictionId: requestId },
      data: { generationPhase: "failed" },
    })
  }

  return NextResponse.json({ ok: true })
}
