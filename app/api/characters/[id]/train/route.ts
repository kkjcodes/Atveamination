import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate, characterTriggerWord } from "@/lib/replicate/client"
import { checkTrainingLimit } from "@/lib/limits"
import { zipSync } from "fflate"

async function getReplicateUsername(): Promise<string> {
  const res = await fetch("https://api.replicate.com/v1/account", {
    headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
  })
  if (!res.ok) throw new Error("Could not fetch Replicate account")
  const data = (await res.json()) as { username: string }
  return data.username
}

async function ensureDestinationModel(owner: string, name: string) {
  try {
    await replicate.models.get(owner, name)
  } catch {
    await replicate.models.create(owner, name, {
      visibility: "private",
      hardware: "gpu-a100-large",
    })
  }
}

async function buildAndUploadTrainingZip(imageUrls: string[]): Promise<string> {
  const entries: Record<string, Uint8Array> = {}
  await Promise.all(
    imageUrls.map(async (url, i) => {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`Could not download training image ${i}`)
      const ext = url.includes(".webp") ? "webp" : url.includes(".jpg") || url.includes(".jpeg") ? "jpg" : "png"
      entries[`training_${String(i).padStart(2, "0")}.${ext}`] = new Uint8Array(await res.arrayBuffer())
    })
  )
  const zip = zipSync(entries)
  const file = await replicate.files.create(new Blob([zip], { type: "application/zip" }), {
    filename: "training.zip",
  })
  return file.urls.get
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const [character, trainingLimit] = await Promise.all([
    prisma.character.findFirst({ where: { id, userId } }),
    checkTrainingLimit(userId, session.user.role),
  ])

  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 })
  }

  if (!trainingLimit.allowed) {
    return NextResponse.json(
      { error: "Training limit reached.", used: trainingLimit.used, limit: trainingLimit.limit, resetsAt: trainingLimit.resetsAt },
      { status: 429 }
    )
  }

  if (!character.selectedStyleUrl) {
    return NextResponse.json({ error: "Select a style before training" }, { status: 400 })
  }

  let trainerModel, replicateUsername: string
  try {
    ;[trainerModel, replicateUsername] = await Promise.all([
      replicate.models.get("ostris", "flux-dev-lora-trainer"),
      getReplicateUsername(),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[train] setup failed:", msg)
    return NextResponse.json({ error: msg }, { status: 502 })
  }

  const versionId = trainerModel.latest_version?.id
  if (!versionId) {
    return NextResponse.json({ error: "Could not resolve trainer model version" }, { status: 502 })
  }

  // Use augmented images (20+) if available, otherwise fall back to the single selected style
  const augmentedUrls = Array.isArray(character.trainingImages)
    ? (character.trainingImages as string[])
    : []
  const trainingUrls = augmentedUrls.length >= 10
    ? augmentedUrls
    : [character.selectedStyleUrl]
  const steps = augmentedUrls.length >= 10 ? 1500 : 800

  let zipUrl: string
  const modelName = `atve-char-${id.slice(0, 8)}`
  try {
    ;[, zipUrl] = await Promise.all([
      ensureDestinationModel(replicateUsername, modelName),
      buildAndUploadTrainingZip(trainingUrls),
    ])
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[train] model/zip setup failed:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const training = await replicate.trainings.create(
    "ostris",
    "flux-dev-lora-trainer",
    versionId,
    {
      destination: `${replicateUsername}/${modelName}` as `${string}/${string}`,
      input: {
        input_images: zipUrl,
        trigger_word: characterTriggerWord(id),
        steps,
      },
    }
  )

  // Store the runnable model path immediately so we know it when training completes
  await prisma.character.update({
    where: { id },
    data: { loraVersion: `${replicateUsername}/${modelName}`, loraTrainingStatus: "processing" },
  })

  const job = await prisma.job.create({
    data: {
      userId,
      type: "lora_training",
      replicatePredictionId: training.id,
      entityId: id,
      entityType: "character",
      status: "processing",
    },
  })

  return NextResponse.json({ job_id: job.id })
}
