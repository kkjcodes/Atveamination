import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS, CARTOON_STYLE_PROMPTS } from "@/lib/replicate/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"

// Identity-anchoring suffix appended to every augmentation prompt.
// Phrased non-enumeratively (same rationale as IDENTITY_DIRECTIVE in
// lib/replicate/client.ts) — listing specific features causes Kontext Pro
// to add them. We only tell it to preserve what is already visible.
const IDENTITY_ANCHOR = "Same exact face, same gender, same hair, same skin tone, same age. Render ONLY what is visible on the character in the reference image — do NOT add facial hair, jewelry, glasses, or markings that aren't already there. Do NOT alter or remove anything that IS there. Identity is more important than expression."

// 20 diverse variations — expressions, angles, poses, lighting, crops.
// Generated from the selected cartoon style image (already drifted once via
// style transfer), so we anchor heavily on the cartoon image's appearance.
const AUGMENTATION_PROMPTS = [
  "Same character with a happy joyful smile, same art style",
  "Same character with a surprised expression and wide eyes, same art style",
  "Same character laughing, same art style",
  "Same character with a serious determined look, same art style",
  "Same character with a sad thoughtful expression, same art style",
  "Same character in side profile facing left, same art style",
  "Same character in three-quarter view, same art style",
  "Same character looking upward at the sky, same art style",
  "Same character looking downward thoughtfully, same art style",
  "Same character full body standing, same art style",
  "Same character sitting casually, same art style",
  "Same character with arms crossed in a confident pose, same art style",
  "Same character waving their hand, same art style",
  "Same character in a running action pose, same art style",
  "Same character leaning against a wall relaxed, same art style",
  "Same character in bright warm sunlight, same art style",
  "Same character in dramatic cool blue lighting, same art style",
  "Same character close-up face portrait crop, same art style",
  "Same character medium shot from waist up, same art style",
  "Same character jumping energetically, same art style",
].map((p) => `${p}. ${IDENTITY_ANCHOR}`)

// 15 cartoon variations generated DIRECTLY from the source selfie (not from the
// drifted cartoon image). These are the strongest face-preservation signal in the
// training set — every variation is a single Kontext Pro pass on the real face,
// so facial structure stays close to the source. Cover angles + expressions +
// shots so the LoRA learns the face from many viewpoints, not just one.
const SOURCE_ANCHORED_VARIATIONS = [
  "Frontal close-up portrait of the face, neutral expression",
  "Frontal close-up portrait of the face, gentle warm smile",
  "Frontal close-up portrait of the face, serious thoughtful expression",
  "Three-quarter view from the left, neutral expression",
  "Three-quarter view from the right, neutral expression",
  "Three-quarter view from the left, warm smile",
  "Side profile facing left",
  "Side profile facing right",
  "Looking slightly upward, frontal view, peaceful expression",
  "Looking slightly downward, frontal view, calm expression",
  "Frontal close-up, eyes looking off to the side",
  "Frontal close-up, head tilted slightly to one side",
  "Medium shot from chest up, neutral pose, frontal view",
  "Medium shot from chest up, three-quarter view, calm expression",
  "Frontal portrait, soft natural expression, direct eye contact with viewer",
]

// Extend timeout — generating 35 images takes 5-8 minutes
export const maxDuration = 540

async function toDataUri(url: string): Promise<string> {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const mime = res.headers.get("content-type") ?? "image/jpeg"
  return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const character = await prisma.character.findFirst({ where: { id, userId } })
  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 })
  if (!character.selectedStyleUrl) {
    return NextResponse.json({ error: "Select a style before generating training data" }, { status: 400 })
  }

  await prisma.character.update({ where: { id }, data: { augmentStatus: "processing" } })

  let styleDataUri: string
  let sourceDataUri: string
  try {
    [styleDataUri, sourceDataUri] = await Promise.all([
      toDataUri(character.selectedStyleUrl),
      toDataUri(character.sourcePhotoUrl),
    ])
  } catch {
    await prisma.character.update({ where: { id }, data: { augmentStatus: "failed" } })
    return NextResponse.json({ error: "Could not load reference images" }, { status: 500 })
  }

  const urls: string[] = []
  const BATCH = 5

  // Inject the character's visual description into every prompt so each
  // augmentation reinforces identity-critical features (glasses, stubble,
  // bindi, etc) instead of letting Kontext Pro drift one variation at a time.
  const charDesc = character.characterDescription?.trim()
  const charAnchor = charDesc ? `The person is: ${charDesc}. ` : ""

  // 20 pose/expression variations anchored on the cartoon style image
  for (let i = 0; i < AUGMENTATION_PROMPTS.length; i += BATCH) {
    const batch = AUGMENTATION_PROMPTS.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (prompt, j) => {
        const output = await replicate.run(MODELS.fluxKontextPro, {
          input: { prompt: `${charAnchor}${prompt}`, input_image: styleDataUri, aspect_ratio: "1:1", output_format: "jpg" },
        })
        const raw = Array.isArray(output) ? String(output[0]) : String(output)
        return mirrorUrlToBlob(raw, `characters/${id}/training/${i + j}.jpg`)
      })
    )
    for (const r of results) {
      if (r.status === "fulfilled") urls.push(r.value)
      else console.warn("[augment] style-anchored image failed:", (r.reason as Error)?.message)
    }
  }

  // 15 cartoon variations anchored on the SOURCE selfie — single Kontext Pro pass
  // from real face preserves identity much better than double-pass through cartoon
  // style. Batched the same way as style-anchored to stay under Replicate rate limits.
  const stylePrompt = CARTOON_STYLE_PROMPTS[character.selectedStyle ?? "pixar"] ?? CARTOON_STYLE_PROMPTS.pixar
  for (let i = 0; i < SOURCE_ANCHORED_VARIATIONS.length; i += BATCH) {
    const batch = SOURCE_ANCHORED_VARIATIONS.slice(i, i + BATCH)
    const sourceResults = await Promise.allSettled(
      batch.map(async (variation, j) => {
        const output = await replicate.run(MODELS.fluxKontextPro, {
          input: {
            prompt: `${charAnchor}${stylePrompt} ${variation}.`,
            input_image: sourceDataUri,
            aspect_ratio: "1:1",
            output_format: "jpg",
          },
        })
        const raw = Array.isArray(output) ? String(output[0]) : String(output)
        return mirrorUrlToBlob(raw, `characters/${id}/training/source_${i + j}.jpg`)
      })
    )
    for (const r of sourceResults) {
      if (r.status === "fulfilled") urls.push(r.value)
      else console.warn("[augment] source-anchored image failed:", (r.reason as Error)?.message)
    }
  }

  if (urls.length < 10) {
    await prisma.character.update({ where: { id }, data: { augmentStatus: "failed" } })
    return NextResponse.json(
      { error: `Only ${urls.length}/35 images succeeded — need at least 10` },
      { status: 500 }
    )
  }

  await prisma.character.update({
    where: { id },
    data: { trainingImages: urls, augmentStatus: "succeeded" },
  })

  return NextResponse.json({ count: urls.length })
}
