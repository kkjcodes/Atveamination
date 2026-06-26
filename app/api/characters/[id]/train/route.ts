import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { characterTriggerWord } from "@/lib/replicate/client"
import { checkTrainingLimit } from "@/lib/limits"
import { logError } from "@/lib/logger"
import { buildAndUploadZip } from "@/lib/training/retrain"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const [character, trainingLimit] = await Promise.all([
    prisma.character.findFirst({ where: { id, userId } }),
    checkTrainingLimit(userId, session.user.role),
  ])

  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 })
  if (!trainingLimit.allowed) {
    return NextResponse.json(
      { error: "Training limit reached.", used: trainingLimit.used, limit: trainingLimit.limit, resetsAt: trainingLimit.resetsAt },
      { status: 429 }
    )
  }
  if (!character.selectedStyleUrl) {
    return NextResponse.json({ error: "Select a style before training" }, { status: 400 })
  }

  const augmentedUrls = Array.isArray(character.trainingImages) ? (character.trainingImages as string[]) : []
  // Source photo 5x to anchor skin tone (see retrain.ts for rationale)
  const sourceCopies = Array(5).fill(character.sourcePhotoUrl)
  const trainingUrls = augmentedUrls.length >= 10
    ? [...sourceCopies, ...augmentedUrls]
    : [character.selectedStyleUrl]
  const steps = augmentedUrls.length >= 10 ? 1500 : 800

  let zipUrl: string
  try {
    zipUrl = await buildAndUploadZip(id, trainingUrls)
  } catch (e) {
    logError("/api/characters/[id]/train", "build_zip", { characterId: id, userId }, e)
    return NextResponse.json({ error: "Failed to prepare training data. Please try again." }, { status: 500 })
  }

  let requestId: string
  try {
    const submission = await fal.queue.submit(FAL_MODELS.loraTraining, {
      input: {
        images_data_url: zipUrl,
        trigger_word: characterTriggerWord(id),
        steps,
      },
    })
    requestId = submission.request_id
  } catch (e) {
    logError("/api/characters/[id]/train", "fal_submit", { characterId: id, userId, steps }, e)
    return NextResponse.json({ error: "Failed to start training. Please try again." }, { status: 502 })
  }

  await prisma.character.update({
    where: { id },
    data: { loraTrainingStatus: "processing", loraVersion: null },
  })

  const job = await prisma.job.create({
    data: {
      userId,
      type: "lora_training_fal",
      replicatePredictionId: requestId,
      entityId: id,
      entityType: "character",
      status: "processing",
    },
  })

  return NextResponse.json({ job_id: job.id })
}
