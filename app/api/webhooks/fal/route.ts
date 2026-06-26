import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS } from "@/lib/replicate/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { verifyFalSecret } from "@/lib/webhooks/verify"

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
  }
}

export async function POST(req: NextRequest) {
  if (!verifyFalSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json() as {
    request_id?: string
    status?: string
    payload?: { video?: { url: string } }
    error?: string
  }

  const requestId = body.request_id
  const videoUrl = body.payload?.video?.url

  console.log("[webhook/fal] received:", { requestId, status: body.status, hasVideo: !!videoUrl })

  if (!requestId) return NextResponse.json({ ok: true })

  if (body.status === "ERROR" || body.error) {
    await prisma.scene.updateMany({
      where: { videoPredictionId: requestId },
      data: { generationPhase: "failed" },
    })
    return NextResponse.json({ ok: true })
  }

  if (!videoUrl) return NextResponse.json({ ok: true })

  const scene = await prisma.scene.findFirst({
    where: { videoPredictionId: requestId },
  })
  if (!scene) return NextResponse.json({ ok: true })

  try {
    const videoClipUrl = await mirrorUrlToBlob(videoUrl, `scenes/${scene.id}/clip.mp4`)
    await prisma.scene.update({ where: { id: scene.id }, data: { videoClipUrl } })
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
          await submitLipSync(scene.id, videoClipUrl, fresh.audioUrl)
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
