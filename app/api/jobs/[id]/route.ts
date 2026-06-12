import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate } from "@/lib/replicate/client"

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
