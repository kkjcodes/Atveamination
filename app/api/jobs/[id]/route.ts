import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate } from "@/lib/replicate/client"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"

const REPLICATE_TO_JOB_STATUS: Record<string, string> = {
  starting: "processing",
  processing: "processing",
  succeeded: "succeeded",
  failed: "failed",
  canceled: "canceled",
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const job = await prisma.job.findFirst({ where: { id, userId } })
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 })
  }

  if (job.type === "lora_training_fal" && job.replicatePredictionId && job.status === "processing") {
    const status = await fal.queue.status(FAL_MODELS.loraTraining, {
      requestId: job.replicatePredictionId,
      logs: false,
    })

    const falToStatus: Record<string, string> = {
      IN_QUEUE: "processing",
      IN_PROGRESS: "processing",
      COMPLETED: "succeeded",
      FAILED: "failed",
    }
    const newStatus = falToStatus[status.status] ?? job.status
    const updates: Record<string, unknown> = { status: newStatus }

    if ((status.status as string) === "COMPLETED") {
      const result = await fal.queue.result(FAL_MODELS.loraTraining, {
        requestId: job.replicatePredictionId,
      })
      const loraUrl = (result.data as { diffusers_lora_file?: { url: string } }).diffusers_lora_file?.url
      if (loraUrl) {
        // Mirror to Azure blob so the LoRA never expires from fal's temporary file storage.
        // If mirroring fails, fall back to the original URL — auto-retrain recovery handles future expiry.
        const mirroredUrl = await mirrorUrlToBlob(loraUrl, `characters/${job.entityId}/lora.safetensors`).catch((e) => {
          console.error("[jobs] LoRA mirror failed, using fal URL:", (e as Error)?.message)
          return loraUrl
        })
        updates.result = { loraUrl: mirroredUrl }
        await prisma.character.update({
          where: { id: job.entityId },
          data: { loraVersion: mirroredUrl, loraTrainingStatus: "succeeded" },
        })
      }
    } else if ((status.status as string) === "FAILED") {
      await prisma.character.update({
        where: { id: job.entityId },
        data: { loraTrainingStatus: "failed" },
      })
    }

    await prisma.job.update({ where: { id }, data: updates })
    return NextResponse.json({ job: { ...job, ...updates } })
  }

  if (
    job.replicatePredictionId &&
    job.status !== "succeeded" &&
    job.status !== "failed" &&
    job.status !== "canceled"
  ) {
    const prediction =
      job.type === "lora_training"
        ? await replicate.trainings.get(job.replicatePredictionId)
        : await replicate.predictions.get(job.replicatePredictionId)

    const newStatus = REPLICATE_TO_JOB_STATUS[prediction.status] ?? job.status

    const updates: Record<string, unknown> = { status: newStatus }
    if (prediction.output) updates.result = { output: prediction.output }
    if (prediction.error) updates.error = String(prediction.error)

    await prisma.job.update({ where: { id }, data: updates })

    if (job.type === "lora_training" && newStatus === "succeeded") {
      // Resolve the version hash now so scene generation can call it directly
      const char = await prisma.character.findUnique({ where: { id: job.entityId ?? "" } })
      let loraVersion = char?.loraVersion ?? undefined
      if (loraVersion && !loraVersion.includes(":")) {
        try {
          const [owner, modelName] = loraVersion.split("/")
          const model = await replicate.models.get(owner, modelName)
          if (model.latest_version?.id) {
            loraVersion = `${loraVersion}:${model.latest_version.id}`
          }
        } catch { /* leave as-is */ }
      }
      await prisma.character.update({
        where: { id: job.entityId ?? undefined },
        data: { loraTrainingStatus: "succeeded", loraVersion },
      })
    } else if (job.type === "lora_training" && newStatus === "failed") {
      await prisma.character.update({
        where: { id: job.entityId ?? undefined },
        data: { loraTrainingStatus: "failed" },
      })
    }

    return NextResponse.json({ job: { ...job, ...updates } })
  }

  return NextResponse.json({ job })
}
