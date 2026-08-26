import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS, CARTOON_STYLE_PROMPTS } from "@/lib/replicate/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import { isBudgetError, ensureKickoffBudget } from "@/lib/budget/guard"

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

// Fire-and-forget — 35 replicate.run calls take 100-200s and blow past
// Cloudflare's 100s origin timeout. Returns 202 immediately; client polls
// GET /api/characters/[id] for augmentStatus.
export const maxDuration = 30

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

  try {
    await ensureKickoffBudget()
  } catch (e) {
    if (isBudgetError(e)) return NextResponse.json({ error: e.message }, { status: 503 })
    throw e
  }

  const character = await prisma.character.findFirst({ where: { id, userId } })
  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 })
  if (!character.selectedStyleUrl) {
    return NextResponse.json({ error: "Select a style before generating training data" }, { status: 400 })
  }

  // Stale-recovery window: 35-image augmentation takes 2-5 min in practice.
  // 15 min gives comfortable slack; anything older was killed by a container
  // restart (SIGTERM on deploy / scale-down) and the row should be reclaimable.
  const STALE_AUGMENT_MS = 15 * 60 * 1000
  const isFreshProcessing =
    character.augmentStatus === "processing" &&
    character.augmentStartedAt !== null &&
    Date.now() - character.augmentStartedAt.getTime() < STALE_AUGMENT_MS
  if (isFreshProcessing) {
    return NextResponse.json({ error: "Augmentation already in progress" }, { status: 409 })
  }

  // Optimistic lock — claim anything non-processing OR stale-processing.
  // isFreshProcessing above already rejected the fresh-in-flight case, so
  // whatever's left here is safe to overwrite.
  const staleThreshold = new Date(Date.now() - STALE_AUGMENT_MS)
  const claimed = await prisma.character.updateMany({
    where: {
      id,
      userId,
      OR: [
        { augmentStatus: null },
        { augmentStatus: { in: ["failed", "succeeded"] } },
        { augmentStartedAt: { lt: staleThreshold } },
        { AND: [{ augmentStatus: "processing" }, { augmentStartedAt: null }] },
      ],
    },
    data: { augmentStatus: "processing", augmentStartedAt: new Date() },
  })
  if (claimed.count === 0) {
    return NextResponse.json({ error: "Augmentation already in progress" }, { status: 409 })
  }

  const augmentStart = Date.now()
  console.log(`[augment] KICKOFF character=${id}`)

  // Fire-and-forget. Runs 35 replicate.run calls; total 100-200s, well past
  // Cloudflare's 100s origin timeout, so it must never block the response.
  // Client polls GET /api/characters/[id] for augmentStatus transition.
  void (async () => {
    try {
      const [styleDataUri, sourceDataUri] = await Promise.all([
        toDataUri(character.selectedStyleUrl!),
        toDataUri(character.sourcePhotoUrl),
      ])

      const urls: string[] = []
      const BATCH = 5

      // Inject the character's visual description into every prompt so each
      // augmentation reinforces identity-critical features instead of letting
      // Kontext Pro drift one variation at a time.
      const charDesc = character.characterDescription?.trim()
      const charAnchor = charDesc ? `The person is: ${charDesc}. ` : ""

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

      // Clearing augmentStartedAt on terminal states matches the stale-recovery
      // contract — "did this ever run?" (has startedAt) vs "is this stuck?"
      // (has startedAt but processing older than window).
      if (urls.length < 10) {
        await prisma.character.update({
          where: { id },
          data: { augmentStatus: "failed", augmentStartedAt: null },
        })
        console.error(`[augment] FAILED character=${id} only ${urls.length}/35 images succeeded after ${Date.now() - augmentStart}ms`)
        return
      }

      await prisma.character.update({
        where: { id },
        data: { trainingImages: urls, augmentStatus: "succeeded", augmentStartedAt: null },
      })
      console.log(`[augment] DONE character=${id} ${urls.length}/35 images ${Date.now() - augmentStart}ms`)
    } catch (e) {
      console.error(`[augment] unhandled character=${id} after ${Date.now() - augmentStart}ms:`, (e as Error)?.message)
      await prisma.character.update({
        where: { id },
        data: { augmentStatus: "failed", augmentStartedAt: null },
      }).catch(() => {})
    }
  })()

  return NextResponse.json({ status: "processing", characterId: id }, { status: 202 })
}
