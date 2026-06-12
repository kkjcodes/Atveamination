import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { verifyFalSecret } from "@/lib/webhooks/verify"

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

    // Atomic: set videoClipUrl, then transition to done if audio is ready (or not needed)
    await prisma.$transaction(async (tx) => {
      await tx.scene.update({ where: { id: scene.id }, data: { videoClipUrl } })
      const fresh = await tx.scene.findUnique({ where: { id: scene.id } })
      if (!fresh) return
      if (fresh.audioPredictionId === null || fresh.audioUrl !== null) {
        await tx.scene.update({ where: { id: scene.id }, data: { generationPhase: "done" } })
      }
    })
  } catch (e) {
    console.error("[webhook/fal] error:", (e as Error)?.message)
    await prisma.scene.updateMany({
      where: { videoPredictionId: requestId },
      data: { generationPhase: "failed" },
    })
  }

  return NextResponse.json({ ok: true })
}
