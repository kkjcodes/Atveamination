import { prisma } from "@/lib/db/client"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { uploadBlob } from "@/lib/storage/client"
import { characterTriggerWord } from "@/lib/replicate/client"
import { zipSync } from "fflate"

export async function buildAndUploadZip(characterId: string, imageUrls: string[]): Promise<string> {
  const entries: Record<string, Uint8Array> = {}
  await Promise.all(
    imageUrls.map(async (url, i) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Could not download training image ${i}: ${res.status}`)
      const ext = url.includes(".webp") ? "webp" : url.includes(".jpg") || url.includes(".jpeg") ? "jpg" : "png"
      entries[`training_${String(i).padStart(2, "0")}.${ext}`] = new Uint8Array(await res.arrayBuffer())
    })
  )
  const zip = zipSync(entries)
  return uploadBlob(`characters/${characterId}/training.zip`, Buffer.from(zip), "application/zip")
}

// Called when a legacy Replicate LoRA is found to be deleted.
// Optimistic-locks the character to "processing" so only one concurrent
// scene generation triggers the re-train even if multiple fire at once.
// Release helper — used on every failure path so the character lock doesn't
// hang around waiting for the 30-min stale threshold.
async function releaseRetrainLock(characterId: string, code: string, message: string): Promise<void> {
  await prisma.character.update({
    where: { id: characterId },
    data: {
      loraTrainingStatus: "failed",
      trainStartedAt: null,
      trainFailureCode: code,
      trainFailureMessage: message,
    },
  }).catch(() => { /* best-effort — if DB is down we can't do much */ })
}

export async function autoRetrainOnFal(characterId: string, userId: string): Promise<void> {
  // Optimistic-lock. Only reclaim from succeeded (the "LoRA expired" scenario
  // this function is designed for). Setting trainStartedAt so the primary
  // train endpoint's stale check reasons about this run correctly if it's
  // interrupted.
  const claimed = await prisma.character.updateMany({
    where: { id: characterId, loraTrainingStatus: "succeeded" },
    data: {
      loraTrainingStatus: "processing",
      loraVersion: null,
      trainStartedAt: new Date(),
      trainFailureCode: null,
      trainFailureMessage: null,
    },
  })
  if (claimed.count === 0) return // another request already claimed it

  // Wrap the entire flow so ANY failure releases the lock. Previous version
  // let ZIP/fal/job failures bubble out with no cleanup — the character
  // would sit at "processing" until the 30-min stale threshold expired.
  try {
    const character = await prisma.character.findUnique({ where: { id: characterId } })
    if (!character) {
      await releaseRetrainLock(characterId, "not_found", "Character disappeared before retrain could start.")
      return
    }

    const augmentedUrls = Array.isArray(character.trainingImages) ? (character.trainingImages as string[]) : []
    const sourceCopies = character.sourcePhotoUrl ? Array(5).fill(character.sourcePhotoUrl) : []
    const trainingUrls = augmentedUrls.length >= 10
      ? [...sourceCopies, ...augmentedUrls]
      : character.selectedStyleUrl ? [character.selectedStyleUrl] : []
    const steps = augmentedUrls.length >= 10 ? 1500 : 800

    if (trainingUrls.length === 0) {
      await releaseRetrainLock(characterId, "internal", "No training images available for retrain.")
      return
    }

    const zipUrl = await buildAndUploadZip(characterId, trainingUrls).catch((e) => {
      throw new Error(`zip build failed: ${(e as Error)?.message}`)
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const webhookSecret = process.env.WEBHOOK_SECRET
    const falWebhookUrl = appUrl && !appUrl.includes("localhost") && webhookSecret
      ? `${appUrl}/api/webhooks/fal?secret=${webhookSecret}&kind=lora_training`
      : undefined

    // Create the Job BEFORE fal submit — same ordering fix as the primary
    // /train route. Job.create failure means we never touch (paid) fal.
    let job: { id: string }
    try {
      job = await prisma.job.create({
        data: {
          userId,
          type: "lora_training_fal",
          replicatePredictionId: `pending:${Date.now()}:${characterId}`,
          entityId: characterId,
          entityType: "character",
          status: "processing",
        },
      })
    } catch (e) {
      await releaseRetrainLock(characterId, "internal", "Couldn't record the retrain job.")
      throw e
    }

    let requestId: string
    try {
      const submission = await fal.queue.submit(FAL_MODELS.loraTraining, {
        input: { images_data_url: zipUrl, trigger_word: characterTriggerWord(characterId), steps },
        ...(falWebhookUrl && { webhookUrl: falWebhookUrl }),
      })
      requestId = submission.request_id
    } catch (e) {
      await Promise.all([
        releaseRetrainLock(characterId, "provider_error", "Fal declined the retrain submission."),
        prisma.job.delete({ where: { id: job.id } }).catch(() => {}),
      ])
      throw e
    }

    try {
      await prisma.job.update({
        where: { id: job.id },
        data: { replicatePredictionId: requestId },
      })
    } catch (e) {
      console.error("[retrain] CRITICAL: fal accepted paid job", requestId, "but Job update failed for job", job.id, "— manual reconciliation needed:", (e as Error)?.message)
      // Don't rethrow — fal work IS running, stale-recovery will eventually
      // cover it.
    }
  } catch (e) {
    // Any unhandled path — release the lock so the user isn't stuck.
    await releaseRetrainLock(characterId, "internal", "Retrain failed. Try again.")
    throw e
  }
}
