import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS, STYLE_HINTS, characterTriggerWord } from "@/lib/replicate/client"
import { moderatePrompt } from "@/lib/ai/moderation"
import { checkSceneLimit, logUsage } from "@/lib/limits"

async function toDataUri(url: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`)
  const mime = res.headers.get("content-type") ?? "image/jpeg"
  return `data:${mime};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const scene = await prisma.scene.findFirst({
    where: { id },
    include: { project: { select: { userId: true, characterId: true } } },
  })

  if (!scene || scene.project.userId !== userId) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 })
  }

  const character = scene.project.characterId
    ? await prisma.character.findUnique({ where: { id: scene.project.characterId } })
    : null

  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 })
  }

  const [limitCheck, moderation] = await Promise.all([
    checkSceneLimit(userId, session.user.role),
    moderatePrompt(scene.description ?? ""),
  ])

  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: "Daily scene limit reached.", used: limitCheck.used, limit: limitCheck.limit, resetsAt: limitCheck.resetsAt },
      { status: 429 }
    )
  }
  if (!moderation.allowed) {
    return NextResponse.json(
      { error: `Scene description not allowed: ${moderation.reason ?? "violates content policy"}` },
      { status: 422 }
    )
  }

  const hints = STYLE_HINTS[character.selectedStyle ?? "default"] ?? STYLE_HINTS.default
  const charDesc = character.characterDescription?.trim()

  // Anchor to scene 1 (orderIndex 0) for all subsequent scenes.
  // Using the immediately previous frame compounds drift — by scene 5 the character
  // has mutated significantly. Scene 1 is the canonical reference for character
  // appearance, background, and style for the entire video.
  const anchorScene =
    scene.orderIndex > 0
      ? await prisma.scene.findFirst({
          where: { projectId: scene.projectId, orderIndex: 0 },
          select: { imageUrl: true },
        })
      : null

  let prediction: { id: string }

  const imageNegativePrompt = "realistic background, photorealistic background, real world background, photograph, photography, stock photo, live action, human skin texture, blurry, low quality, nsfw, nudity, nude, explicit, sexual, adult content"

  // Register webhook so server can drive transitions even if the browser closes.
  // Skipped in local dev since localhost isn't reachable from Replicate.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const replicateWebhook = appUrl && !appUrl.includes("localhost")
    ? { webhook: `${appUrl}/api/webhooks/replicate`, webhook_events_filter: ["completed"] as ["completed"] }
    : {}

  if (anchorScene?.imageUrl) {
    // ── Subsequent scenes: anchor to scene 1 ──────────────────────────────
    // Always reference the first scene's established character, background,
    // and style — not the immediately preceding frame — to prevent drift.
    const referenceDataUri = await toDataUri(anchorScene.imageUrl)
    prediction = await replicate.predictions.create({
      model: MODELS.fluxKontextPro as `${string}/${string}`,
      input: {
        prompt: `Using this as the canonical reference for character appearance, art style, and world: ${hints.image}. Show the same character doing: ${scene.description}`,
        input_image: referenceDataUri,
        aspect_ratio: "16:9",
        output_format: "jpg",
      },
      ...replicateWebhook,
    })
  } else if (character.loraVersion && character.loraTrainingStatus === "succeeded") {
    // ── Scene 1 with trained LoRA: best face accuracy ──────────────────────
    // The LoRA has memorized the character's face. Use it for the anchor frame
    // that all subsequent scenes will chain from.
    const loraRef = character.loraVersion.includes(":")
      ? { version: character.loraVersion.split(":")[1] }
      : { model: character.loraVersion as `${string}/${string}` }

    prediction = await replicate.predictions.create({
      ...loraRef,
      input: {
        prompt: `${characterTriggerWord(character.id)}, ${charDesc ? charDesc + ", " : ""}${scene.description}, ${hints.image}, illustrated cartoon background, 2D painted background, animation keyframe`,
        negative_prompt: imageNegativePrompt,
        width: 1024,
        height: 576,
        num_inference_steps: 30,
      },
      ...replicateWebhook,
    })
  } else {
    // ── Scene 1 fallback: Kontext Pro with character style reference ───────
    // No LoRA yet — use the selected style image as the reference so the
    // character's look is still grounded.
    if (!character.selectedStyleUrl) {
      return NextResponse.json({ error: "No reference image — select a style first" }, { status: 400 })
    }
    const referenceDataUri = await toDataUri(character.selectedStyleUrl)
    prediction = await replicate.predictions.create({
      model: MODELS.fluxKontextPro as `${string}/${string}`,
      input: {
        prompt: `${charDesc ? charDesc + ", " : ""}${scene.description}, ${hints.image}, illustrated cartoon background, 2D painted background, animation keyframe`,
        input_image: referenceDataUri,
        aspect_ratio: "16:9",
        output_format: "jpg",
      },
      ...replicateWebhook,
    })
  }

  await Promise.all([
    prisma.scene.update({
      where: { id },
      data: {
        imagePredictionId: prediction.id,
        generationPhase: "image",
        // Clear previous generation results so polling restarts cleanly
        videoPredictionId: null,
        audioPredictionId: null,
        imageUrl: null,
        videoClipUrl: null,
        audioUrl: null,
      },
    }),
    logUsage(userId, "scene_generate", id, "scene"),
  ])

  return NextResponse.json({ status: "processing" })
}
