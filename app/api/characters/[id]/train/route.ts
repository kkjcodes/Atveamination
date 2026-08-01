import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { characterTriggerWord } from "@/lib/replicate/client"
import { checkTrainingLimit } from "@/lib/limits"
import { logError } from "@/lib/logger"
import { buildAndUploadZip } from "@/lib/training/retrain"
import { claimAsyncWork, STALE_WINDOWS } from "@/lib/async-work/claim"

// POST /api/characters/[id]/train — kick off LoRA training on fal.
//
// Optimistic-lock via loraTrainingStatus + trainStartedAt to prevent duplicate
// paid fal.queue.submit calls. Without this, two tabs (or the character-new
// wizard racing the character-page "Continue training" button) can both pass
// the ownership check, both build the ZIP, and both submit ~$0.40 fal jobs.
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

  // Shared claim contract. loraTrainingStatus "processing" that's fresh
  // (started <30 min ago) blocks new attempts. Older values or terminal
  // states (succeeded/failed) are reclaimable. STALE_WINDOWS.characterTrain
  // (30 min) matches fal LoRA training p99 duration.
  const decision = await claimAsyncWork({
    currentStatus: character.loraTrainingStatus,
    currentStartedAt: character.trainStartedAt,
    activeStatus: "processing",
    staleAfterMs: STALE_WINDOWS.characterTrain,
    claim: async () => {
      const staleThreshold = new Date(Date.now() - STALE_WINDOWS.characterTrain)
      const res = await prisma.character.updateMany({
        where: {
          id,
          userId,
          OR: [
            { loraTrainingStatus: null },
            { loraTrainingStatus: { in: ["succeeded", "failed"] } },
            { trainStartedAt: { lt: staleThreshold } },
            { AND: [{ loraTrainingStatus: "processing" }, { trainStartedAt: null }] },
          ],
        },
        data: {
          loraTrainingStatus: "processing",
          loraVersion: null,
          trainStartedAt: new Date(),
          trainFailureCode: null,
          trainFailureMessage: null,
        },
      })
      return res.count
    },
  })
  if (!decision.ok) {
    return NextResponse.json({ error: "Training already in progress" }, { status: 409 })
  }

  const augmentedUrls = Array.isArray(character.trainingImages) ? (character.trainingImages as string[]) : []
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
    // Release the lock so the user can retry.
    await prisma.character.update({
      where: { id },
      data: {
        loraTrainingStatus: "failed",
        trainStartedAt: null,
        trainFailureCode: "internal",
        trainFailureMessage: "Couldn't prepare training data. Try again.",
      },
    }).catch(() => {})
    return NextResponse.json({ error: "Failed to prepare training data. Please try again." }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const webhookSecret = process.env.WEBHOOK_SECRET
  const falWebhookUrl = appUrl && !appUrl.includes("localhost") && webhookSecret
    ? `${appUrl}/api/webhooks/fal?secret=${webhookSecret}&kind=lora_training`
    : undefined

  // Create the Job row BEFORE submitting to fal. Previous ordering (submit
  // fal → create Job) had a hole: if Job.create failed, fal had already
  // accepted paid work but the webhook couldn't find the correlation row,
  // so completion was silently dropped. Now the Job exists first with a
  // placeholder request_id; if fal submit fails we release the lock AND
  // delete the placeholder. If Job.create fails, we never touch fal.
  let job: { id: string }
  try {
    job = await prisma.job.create({
      data: {
        userId,
        type: "lora_training_fal",
        replicatePredictionId: `pending:${Date.now()}:${id}`, // placeholder; updated after fal accepts
        entityId: id,
        entityType: "character",
        status: "processing",
      },
    })
  } catch (e) {
    logError("/api/characters/[id]/train", "job_create", { characterId: id, userId }, e)
    await prisma.character.update({
      where: { id },
      data: {
        loraTrainingStatus: "failed",
        trainStartedAt: null,
        trainFailureCode: "internal",
        trainFailureMessage: "Couldn't record the training job. Try again.",
      },
    }).catch(() => {})
    return NextResponse.json({ error: "Failed to start training. Please try again." }, { status: 500 })
  }

  let requestId: string
  try {
    const submission = await fal.queue.submit(FAL_MODELS.loraTraining, {
      input: {
        images_data_url: zipUrl,
        trigger_word: characterTriggerWord(id),
        steps,
      },
      ...(falWebhookUrl && { webhookUrl: falWebhookUrl }),
    })
    requestId = submission.request_id
  } catch (e) {
    logError("/api/characters/[id]/train", "fal_submit", { characterId: id, userId, steps }, e)
    // Release character lock AND delete the placeholder Job so we don't have
    // an orphaned "processing" row with no fal correlation.
    await Promise.all([
      prisma.character.update({
        where: { id },
        data: {
          loraTrainingStatus: "failed",
          trainStartedAt: null,
          trainFailureCode: "provider_error",
          trainFailureMessage: "Couldn't start training. Try again in a moment.",
        },
      }).catch(() => {}),
      prisma.job.delete({ where: { id: job.id } }).catch(() => {}),
    ])
    return NextResponse.json({ error: "Failed to start training. Please try again." }, { status: 502 })
  }

  // Update Job with real fal request_id. If THIS fails we have paid work
  // in-flight with no correlation — log loudly for manual reconciliation.
  // Rare (DB down + fal up is unusual) but worth surfacing.
  try {
    await prisma.job.update({
      where: { id: job.id },
      data: { replicatePredictionId: requestId },
    })
  } catch (e) {
    console.error("[train] CRITICAL: fal accepted paid job", requestId, "but Job update failed for job", job.id, "— manual reconciliation needed:", (e as Error)?.message)
    // We don't return an error to the user here — the fal work IS running,
    // and it'll eventually flip character.loraTrainingStatus via the
    // stale-recovery path even if the webhook can't find its Job row.
  }

  return NextResponse.json({ job_id: job.id, reclaimedStale: decision.wasStale })
}
