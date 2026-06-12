import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS, STYLE_HINTS } from "@/lib/replicate/client"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { sanitizeVideoPrompt } from "@/lib/ai/moderation"
import { verifyReplicateSignature } from "@/lib/webhooks/verify"

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
    await Promise.all([
      prisma.scene.updateMany({
        where: { imagePredictionId: predictionId, generationPhase: "image" },
        data: { generationPhase: "failed" },
      }),
      prisma.scene.updateMany({
        where: { audioPredictionId: predictionId },
        data: { generationPhase: "failed" },
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
    include: { project: { select: { characterId: true, voiceId: true } } },
  })

  if (imageScene) {
    try {
      const keyframeUrl = Array.isArray(output) ? String(output[0]) : String(output)

      const [character, voice] = await Promise.all([
        imageScene.project.characterId
          ? prisma.character.findUnique({ where: { id: imageScene.project.characterId } })
          : null,
        imageScene.project.voiceId
          ? prisma.voice.findUnique({ where: { id: imageScene.project.voiceId } })
          : null,
      ])

      if (!character) {
        await prisma.scene.update({ where: { id: imageScene.id }, data: { generationPhase: "failed" } })
        return NextResponse.json({ ok: true })
      }

      const hints = STYLE_HINTS[character.selectedStyle ?? "default"] ?? STYLE_HINTS.default
      const charDesc = character.characterDescription?.trim()
      const ttsText = imageScene.voiceScript?.trim() || imageScene.description

      const rawVideoPrompt = `${hints.video}, ${charDesc ? charDesc + ", " : ""}${imageScene.description}, animated cartoon scene, illustrated cartoon background, 2D painted background, slow smooth motion, gentle movement, stable background`
      const negativePrompt = "realistic, photorealistic, live action, real background, real world background, photograph, photography, stock photo, natural landscape, human skin texture, blurry, low quality, fast motion, sudden movement, shaky camera, motion blur, camera pan, flickering, nsfw, nudity, nude, explicit, sexual, adult content"

      const [videoPrompt, imageUrl] = await Promise.all([
        sanitizeVideoPrompt(rawVideoPrompt),
        mirrorUrlToBlob(keyframeUrl, `scenes/${imageScene.id}/frame.jpg`),
      ])

      const base = process.env.NEXT_PUBLIC_APP_URL
      const webhookSecret = process.env.WEBHOOK_SECRET
      const falWebhookUrl = base && !base.includes("localhost") && webhookSecret
        ? `${base}/api/webhooks/fal?secret=${webhookSecret}`
        : undefined

      const falSubmit = await fal.queue.submit(FAL_MODELS.wan, {
        input: {
          prompt: videoPrompt,
          image_url: keyframeUrl,
          negative_prompt: negativePrompt,
          resolution: "720p",
          aspect_ratio: "16:9",
          guide_scale: 8,
        },
        ...(falWebhookUrl && { webhookUrl: falWebhookUrl }),
      })

      let audioPred: { id: string } | null = null
      if (voice?.sampleAudioUrl) {
        try {
          const speakerUri = await toDataUri(voice.sampleAudioUrl)
          audioPred = await replicate.predictions.create({
            ...predRef(MODELS.xttsV2),
            input: { text: ttsText, speaker: speakerUri, language: "en", cleanup_voice: true },
            ...webhookConfig(),
          })
        } catch (e) {
          console.error("[webhook/replicate] audio pred failed:", (e as Error)?.message)
        }
      }

      // Optimistic lock: only transition if still in image phase with no videoPredictionId
      const updated = await prisma.scene.updateMany({
        where: { id: imageScene.id, generationPhase: "image", videoPredictionId: null },
        data: {
          imageUrl,
          generationPhase: "video",
          videoPredictionId: falSubmit.request_id,
          audioPredictionId: audioPred?.id ?? null,
        },
      })

      if (updated.count === 0) {
        console.log("[webhook/replicate] image already transitioned (race with polling), skipping")
      }
    } catch (e) {
      console.error("[webhook/replicate] image handler error:", (e as Error)?.message)
      await prisma.scene.update({ where: { id: imageScene.id }, data: { generationPhase: "failed" } })
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

      // Atomic: set audioUrl, then transition to done if video is already mirrored
      await prisma.$transaction(async (tx) => {
        await tx.scene.update({ where: { id: audioScene.id }, data: { audioUrl } })
        const fresh = await tx.scene.findUnique({ where: { id: audioScene.id } })
        if (fresh?.videoClipUrl) {
          await tx.scene.update({ where: { id: audioScene.id }, data: { generationPhase: "done" } })
        }
      })
    } catch (e) {
      console.error("[webhook/replicate] audio handler error:", (e as Error)?.message)
    }
  }

  return NextResponse.json({ ok: true })
}
