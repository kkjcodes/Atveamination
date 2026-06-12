import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS } from "@/lib/replicate/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"

// 20 diverse variations — expressions, angles, poses, lighting, crops
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
]

// Extend timeout — generating 20 images takes 3-5 minutes
export const maxDuration = 300

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

  let imageDataUri: string
  try {
    imageDataUri = await toDataUri(character.selectedStyleUrl)
  } catch {
    await prisma.character.update({ where: { id }, data: { augmentStatus: "failed" } })
    return NextResponse.json({ error: "Could not load style image" }, { status: 500 })
  }

  const urls: string[] = []
  const BATCH = 5

  for (let i = 0; i < AUGMENTATION_PROMPTS.length; i += BATCH) {
    const batch = AUGMENTATION_PROMPTS.slice(i, i + BATCH)
    const results = await Promise.allSettled(
      batch.map(async (prompt, j) => {
        const output = await replicate.run(MODELS.fluxKontextPro, {
          input: { prompt, input_image: imageDataUri, aspect_ratio: "1:1", output_format: "jpg" },
        })
        const raw = Array.isArray(output) ? String(output[0]) : String(output)
        return mirrorUrlToBlob(raw, `characters/${id}/training/${i + j}.jpg`)
      })
    )
    for (const r of results) {
      if (r.status === "fulfilled") urls.push(r.value)
      else console.warn("[augment] image failed:", (r.reason as Error)?.message)
    }
  }

  if (urls.length < 10) {
    await prisma.character.update({ where: { id }, data: { augmentStatus: "failed" } })
    return NextResponse.json(
      { error: `Only ${urls.length}/20 images succeeded — need at least 10` },
      { status: 500 }
    )
  }

  await prisma.character.update({
    where: { id },
    data: { trainingImages: urls, augmentStatus: "succeeded" },
  })

  return NextResponse.json({ count: urls.length })
}
