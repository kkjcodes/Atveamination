import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS, STYLE_HINTS, characterTriggerWord } from "@/lib/replicate/client"
import { autoRetrainOnFal } from "@/lib/training/retrain"
import { fal, FAL_MODELS } from "@/lib/fal/client"
import { moderatePrompt } from "@/lib/ai/moderation"
import { checkSceneLimit, logUsage } from "@/lib/limits"
import { logError } from "@/lib/logger"

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
    include: { project: { select: { userId: true, characterId: true, firstFrameDescription: true, characters: { orderBy: { orderIndex: "asc" } } } } },
  })

  if (!scene || scene.project.userId !== userId) {
    return NextResponse.json({ error: "Scene not found" }, { status: 404 })
  }

  // Detect shared scenes from the SCENE field directly, not from a resolved
  // fallback. A shared scene is one where focus_character_id was deliberately
  // saved as null on a project with multiple characters. The previous code
  // resolved focusCharId via `?? project.characterId`, which made it always
  // truthy, so shared scenes silently fell through to the anchor path instead
  // of Multi-Kontext — defeating Option A entirely.
  const projectCharIds = scene.project.characters.map((pc) => pc.characterId)
  const isSharedScene = scene.focusCharacterId === null && projectCharIds.length > 1

  // For non-shared scenes, resolve focus character (scene override or project primary).
  const focusCharId = isSharedScene ? null : (scene.focusCharacterId ?? scene.project.characterId ?? null)

  const character = focusCharId
    ? await prisma.character.findUnique({ where: { id: focusCharId } })
    : !isSharedScene && scene.project.characterId
      ? await prisma.character.findUnique({ where: { id: scene.project.characterId } })
      : null

  if (!isSharedScene && !character) {
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

  const hints = character
    ? STYLE_HINTS[character.selectedStyle ?? "default"] ?? STYLE_HINTS.default
    : STYLE_HINTS.default
  const charDesc = character?.characterDescription?.trim()

  // Captured from scene 0's keyframe via Claude vision. Keeps clothing, hair,
  // and accessories consistent across scenes — anchor image reference alone
  // doesn't reliably preserve these (Kontext Pro can subtly swap them).
  // Null for scene 0 (nothing to anchor on yet) and for projects that
  // haven't generated scene 0 yet.
  const frameAnchor = (scene.orderIndex > 0 && scene.project.firstFrameDescription?.trim())
    ? ` Maintain visual continuity from scene 1 — keep the same outfits, hair, and accessories: ${scene.project.firstFrameDescription.trim()}.`
    : ""

  const [anchorScene, prevScene] = await Promise.all([
    scene.orderIndex > 0
      ? prisma.scene.findFirst({
          where: { projectId: scene.projectId, orderIndex: 0 },
          select: { imageUrl: true },
        })
      : null,
    scene.orderIndex > 0
      ? prisma.scene.findFirst({
          where: { projectId: scene.projectId, orderIndex: scene.orderIndex - 1 },
          select: { description: true },
        })
      : null,
  ])

  let prediction: { id: string }

  const imageNegativePrompt = "realistic background, photorealistic background, real world background, photograph, photography, stock photo, live action, human skin texture, blurry, low quality, nsfw, nudity, nude, explicit, sexual, adult content"

  try {

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const replicateWebhook = appUrl && !appUrl.includes("localhost")
    ? { webhook: `${appUrl}/api/webhooks/replicate`, webhook_events_filter: ["completed"] as ["completed"] }
    : {}

  if (isSharedScene) {
    // ── Shared scene: multi-reference Kontext via fal.ai ──────────────────
    // Each character's style image is passed as a separate reference, letting
    // the model preserve per-character identity instead of fusing features.
    // We also label each character in the prompt by reference image position
    // so the model knows which image is whom — without this, Multi-Kontext
    // sometimes renders BOTH subjects from a single reference image
    // (the "two Kumars / no Kirti" bug).
    const charLookup = await prisma.character.findMany({
      where: { id: { in: projectCharIds } },
      select: { id: true, name: true, selectedStyleUrl: true, selectedStyle: true, characterDescription: true },
    })
    // Preserve project character ordering — Prisma's `in` query doesn't guarantee
    // result order, but reference image order must match the prompt's labels.
    const projectChars = projectCharIds
      .map((id) => charLookup.find((c) => c.id === id))
      .filter((c): c is NonNullable<typeof c> => c != null && !!c.selectedStyleUrl)
    if (projectChars.length === 0) {
      return NextResponse.json({ error: "No character style images — select styles for all characters first" }, { status: 400 })
    }
    const styleUrls = projectChars.map((c) => c.selectedStyleUrl as string)

    // Explicit cast labels with reference image binding + anti-duplication clause.
    // Without these, Multi-Kontext frequently duplicates one character or adds
    // extra anonymous people to fill subject slots in the description.
    const castBlock = projectChars
      .map((c, i) => {
        const label = String.fromCharCode(65 + i) // A, B, C, D
        const desc = c.characterDescription?.trim()
        return `• Character ${label} (from reference image ${i + 1}): ${c.name}${desc ? ` — ${desc}` : ""}`
      })
      .join("\n")

    const falSubmit = await fal.queue.submit(FAL_MODELS.kontextMulti, {
      input: {
        prompt: `Cast — render EXACTLY one of each character below. Do NOT duplicate any character. Do NOT add any extra people:
${castBlock}

Scene: ${scene.description}${frameAnchor}

Style: ${hints.image}, illustrated cartoon background, 2D painted background, animation keyframe.

CRITICAL constraints: exactly one of each named character in the cast, never more. No anonymous extra people. No duplicates of the same character.`,
        image_urls: styleUrls,
        aspect_ratio: "16:9",
        output_format: "jpeg",
      },
    })
    prediction = { id: `falmk:${falSubmit.request_id}` }
  } else if (anchorScene?.imageUrl) {
    // ── Subsequent scenes: anchor to scene 1 ──────────────────────────────
    const referenceDataUri = await toDataUri(anchorScene.imageUrl)
    const prevContext = prevScene?.description
      ? `This scene follows: "${prevScene.description}". `
      : ""
    prediction = await replicate.predictions.create({
      model: MODELS.fluxKontextPro as `${string}/${string}`,
      input: {
        prompt: `Preserve the EXACT character from this reference image — identical facial features, hairstyle, hair color, age, body proportions, skin tone, and clothing.${frameAnchor} ${prevContext}Now: ${scene.description}. ${charDesc ? charDesc + ". " : ""}${hints.image}`,
        input_image: referenceDataUri,
        aspect_ratio: "16:9",
        output_format: "jpg",
      },
      ...replicateWebhook,
    })
  } else if (character?.loraVersion && character.loraTrainingStatus === "succeeded") {
    const loraPrompt = `${characterTriggerWord(character.id)}, ${charDesc ? charDesc + ", " : ""}${scene.description}, ${hints.image}, illustrated cartoon background, 2D painted background, animation keyframe`

    // Lazy-built fallback: only constructed if a LoRA branch fails.
    const fallbackToKontextPro = async (): Promise<{ id: string }> => {
      if (!character.selectedStyleUrl) {
        throw new Error("No reference image — select a style first")
      }
      const referenceDataUri = await toDataUri(character.selectedStyleUrl)
      const pred = await replicate.predictions.create({
        model: MODELS.fluxKontextPro as `${string}/${string}`,
        input: {
          prompt: `${charDesc ? charDesc + ", " : ""}${scene.description}, ${hints.image}, illustrated cartoon background, 2D painted background, animation keyframe`,
          input_image: referenceDataUri,
          aspect_ratio: "16:9",
          output_format: "jpg",
        },
        ...replicateWebhook,
      })
      // Re-train in the background — future scenes will use the new LoRA.
      autoRetrainOnFal(character.id, userId).catch((e) => {
        console.error("[scene/generate] auto-retrain failed:", (e as Error)?.message)
      })
      return pred
    }

    if (character.loraVersion.startsWith("https://")) {
      // ── Scene 1 with fal.ai-trained LoRA ──────────────────────────────────
      // Falls back to Kontext Pro if the fal.media file URL has expired.
      try {
        // fal-ai/flux-lora has no negative_prompt parameter (unlike fal-ai/flux-dev).
        // Style/anti-realism guidance is carried by the LoRA itself + prompt hints.
        const falSubmit = await fal.queue.submit(FAL_MODELS.fluxLora, {
          input: {
            prompt: loraPrompt,
            loras: [{ path: character.loraVersion, scale: 1 }],
            image_size: { width: 1024, height: 576 },
            num_inference_steps: 28,
            output_format: "jpeg",
          },
        })
        prediction = { id: `fal:${falSubmit.request_id}` }
      } catch (loraErr) {
        const msg = (loraErr as Error)?.message ?? ""
        const body = JSON.stringify((loraErr as { body?: unknown })?.body ?? "")
        // 404 "Application X not found" = our SDK or endpoint name is stale — NOT a LoRA file problem.
        // Don't auto-retrain in that case; surface the error so we fix the code.
        const isEndpointMissing = body.includes("Application") && body.includes("not found")
        if (isEndpointMissing) {
          console.error("[scene/generate] fal endpoint deprecated — fix FAL_MODELS, not the LoRA:", body)
          throw loraErr
        }
        if (!msg.includes("Not Found") && !msg.includes("404")) throw loraErr
        console.warn("[scene/generate] fal.ai LoRA file expired, falling back to Kontext Pro:", character.loraVersion)
        prediction = await fallbackToKontextPro()
      }
    } else {
      // ── Scene 1 with Replicate-trained LoRA (legacy) ─────────────────────
      // Falls back to Kontext Pro if the LoRA model was deleted from Replicate.
      const loraRef = character.loraVersion.includes(":")
        ? { version: character.loraVersion.split(":")[1] }
        : { model: character.loraVersion as `${string}/${string}` }
      try {
        prediction = await replicate.predictions.create({
          ...loraRef,
          input: {
            prompt: loraPrompt,
            negative_prompt: imageNegativePrompt,
            width: 1024,
            height: 576,
            num_inference_steps: 30,
          },
          ...replicateWebhook,
        })
      } catch (loraErr) {
        const msg = (loraErr as Error)?.message ?? ""
        if (!msg.includes("Not Found") && !msg.includes("404")) throw loraErr
        console.warn("[scene/generate] Replicate LoRA not found, falling back to Kontext Pro:", character.loraVersion)
        prediction = await fallbackToKontextPro()
      }
    }
  } else {
    // ── Scene 1 fallback: Kontext Pro with character style reference ───────
    if (!character?.selectedStyleUrl) {
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
  } catch (err) {
    logError("/api/scenes/[id]/generate", "create_prediction", { sceneId: id, userId, characterId: character?.id ?? null, loraVersion: character?.loraVersion ?? null, orderIndex: scene.orderIndex }, err)
    await prisma.scene.update({ where: { id }, data: { generationPhase: "failed" } }).catch(() => {})
    return NextResponse.json({ error: "Failed to start scene generation. Please try again." }, { status: 500 })
  }
}
