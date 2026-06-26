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
export async function autoRetrainOnFal(characterId: string, userId: string): Promise<void> {
  const claimed = await prisma.character.updateMany({
    where: { id: characterId, loraTrainingStatus: "succeeded" },
    data: { loraTrainingStatus: "processing", loraVersion: null },
  })
  if (claimed.count === 0) return // another request already claimed it

  const character = await prisma.character.findUnique({ where: { id: characterId } })
  if (!character) return

  const augmentedUrls = Array.isArray(character.trainingImages) ? (character.trainingImages as string[]) : []
  // Include source photo 5x alongside cartoons. The 35 cartoon variants all carry
  // a slight Kontext-Pro skin-tone darkening — 5 real photos in 40-image training
  // set (~12% weight) is enough to anchor skin tone on the source without
  // dominating cartoon style.
  const sourceCopies = character.sourcePhotoUrl ? Array(5).fill(character.sourcePhotoUrl) : []
  const trainingUrls = augmentedUrls.length >= 10
    ? [...sourceCopies, ...augmentedUrls]
    : character.selectedStyleUrl ? [character.selectedStyleUrl] : []
  const steps = augmentedUrls.length >= 10 ? 1500 : 800

  if (trainingUrls.length === 0) {
    await prisma.character.update({ where: { id: characterId }, data: { loraTrainingStatus: "failed" } })
    return
  }

  const zipUrl = await buildAndUploadZip(characterId, trainingUrls)

  const submission = await fal.queue.submit(FAL_MODELS.loraTraining, {
    input: { images_data_url: zipUrl, trigger_word: characterTriggerWord(characterId), steps },
  })

  await prisma.job.create({
    data: {
      userId,
      type: "lora_training_fal",
      replicatePredictionId: submission.request_id,
      entityId: characterId,
      entityType: "character",
      status: "processing",
    },
  })
}
