import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { replicate, MODELS, CARTOON_STYLE_PROMPTS, STYLE_BATCH_1, STYLE_BATCH_2 } from "@/lib/replicate/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"

async function toDataUri(url: string): Promise<string> {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  const mime = res.headers.get("content-type") ?? "image/png"
  return `data:${mime};base64,${Buffer.from(buf).toString("base64")}`
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const character = await prisma.character.findFirst({ where: { id, userId } })
  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 })
  }

  let imageDataUri: string
  try {
    imageDataUri = await toDataUri(character.sourcePhotoUrl)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[generate-styles] toDataUri failed:", msg)
    return NextResponse.json({ error: `Could not load source image: ${msg}` }, { status: 500 })
  }

  const batch = req.nextUrl.searchParams.get("batch") === "2" ? STYLE_BATCH_2 : STYLE_BATCH_1
  const styleEntries = batch.map((key) => [key, CARTOON_STYLE_PROMPTS[key]] as [string, string])

  // Anchor every style transfer prompt on the character's visual description.
  // This carries identity-critical features (e.g. "wire-rim glasses, light stubble,
  // bindi") into the prompt so Kontext Pro doesn't simplify them away.
  const charDesc = character.characterDescription?.trim()
  const charAnchor = charDesc ? `The person is: ${charDesc}. ` : ""

  try {
    const options = await Promise.all(
      styleEntries.map(async ([key, stylePrompt]) => {
        const output = await replicate.run(MODELS.fluxKontextPro, {
          input: {
            prompt: `${charAnchor}${stylePrompt}`,
            input_image: imageDataUri,
            aspect_ratio: "1:1",
            output_format: "jpg",
          },
        })

        const replicateUrl = Array.isArray(output) ? String(output[0]) : String(output)
        const styleUrl = await mirrorUrlToBlob(
          replicateUrl,
          `characters/${id}/styles/${key}.jpg`
        )

        return prisma.characterOption.create({
          data: { characterId: id, styleUrl, styleName: key },
        })
      })
    )

    return NextResponse.json({
      options: options.map((o: { id: string; styleName: string; styleUrl: string }) => ({ id: o.id, style_name: o.styleName, style_url: o.styleUrl })),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("[generate-styles] Replicate error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
