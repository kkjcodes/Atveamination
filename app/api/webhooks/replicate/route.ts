import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS, STYLE_HINTS } from "@/lib/replicate/client"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { sanitizeVideoPrompt } from "@/lib/ai/moderation"
import { describeFirstFrame } from "@/lib/ai/describe"
import { inferSpeakerCharacterId } from "@/lib/scene-routing"
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
      characters: { orderBy: { orderIndex: "asc" }, include: { character: { select: { id: true, name: true } } } },
    } } },
  })

  if (imageScene) {
    try {
      const keyframeUrl = Array.isArray(output) ? String(output[0]) : String(output)

      // Use focusCharacterId for visual style hints (the LoRA/Kontext target)
      const charId = imageScene.focusCharacterId ?? imageScene.project.characterId
      // Voice: prefer the SPEAKER character's voice (whoever is delivering the
      // line in this scene), not the focus character. A scene can visually focus
      // on Kirti while Kumar is the one speaking ("Kirti, will you marry me?").
      // If speakerCharacterId wasn't set at save time (legacy scene or test
      // script that bypassed the save endpoint), infer it from the voiceScript
      // text — "Heather, will you..." implies Matt is speaking.
      let voiceCharId = imageScene.speakerCharacterId ?? null
      if (!voiceCharId) {
        const projectChars = imageScene.project.characters.map((pc) => pc.character)
        voiceCharId = inferSpeakerCharacterId(imageScene.voiceScript, projectChars) ?? charId
      }
      const [character, scriptedVoice, projectVoice] = await Promise.all([
        charId ? prisma.character.findUnique({ where: { id: charId } }) : null,
        voiceCharId ? prisma.voice.findFirst({ where: { characterId: voiceCharId } }) : null,
        imageScene.project.voiceId
          ? prisma.voice.findUnique({ where: { id: imageScene.project.voiceId } })
          : null,
      ])
      const voice = scriptedVoice ?? projectVoice

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

      // Scene 0 is the visual anchor for all subsequent scenes — capture its
      // clothing/hair/accessory cues so we can inject them into scenes 1-N.
      // Fire-and-forget: stale by 1 scene is acceptable; user generates scenes
      // sequentially so by the time they hit scene 1, this has resolved.
      if (imageScene.orderIndex === 0) {
        const projectId = imageScene.projectId
        describeFirstFrame(imageUrl)
          .then(async (desc) => {
            if (desc) await prisma.project.update({ where: { id: projectId }, data: { firstFrameDescription: desc } })
          })
          .catch((e) => console.error("[webhook/replicate] firstFrame describe failed:", (e as Error)?.message))
      }

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
          num_frames: 100,
        },
        ...(falWebhookUrl && { webhookUrl: falWebhookUrl }),
      })

      const kokoroVoice = (voice?.ttsParams as { kokoroVoice?: string } | null)?.kokoroVoice
      let audioPred: { id: string } | null = null
      let preGeneratedAudioUrl: string | null = null

      if (kokoroVoice && ttsText) {
        try {
          const r = await fal.subscribe(FAL_MODELS.kokoro, { input: { text: ttsText, voice: kokoroVoice } })
          const d = r.data as { audio?: { url: string }; audio_url?: string; audio_file?: { url: string } }
          const rawUrl = d?.audio?.url ?? d?.audio_url ?? d?.audio_file?.url
          if (rawUrl) {
            preGeneratedAudioUrl = await mirrorUrlToBlob(rawUrl, `scenes/${imageScene.id}/audio.wav`).catch(() => null)
          } else {
            console.error("[webhook/replicate] kokoro returned no url, response shape:", Object.keys(d ?? {}))
          }
        } catch (e) {
          console.error("[webhook/replicate] kokoro audio failed:", (e as Error)?.message)
        }
      } else if (voice?.sampleAudioUrl) {
        try {
          const speakerUri = await toDataUri(voice.sampleAudioUrl)
          audioPred = await replicate.predictions.create({
            ...predRef(MODELS.xttsV2),
            input: { text: ttsText, speaker: speakerUri, language: "en", cleanup_voice: false },
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
          audioUrl: preGeneratedAudioUrl,
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
