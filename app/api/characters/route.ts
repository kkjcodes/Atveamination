import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { uploadBlob } from "@/lib/storage/client"
import { describeCharacter } from "@/lib/ai/describe"
import sharp from "sharp"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const rows = await prisma.character.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, selectedStyleUrl: true, sourcePhotoUrl: true, selectedStyle: true, loraTrainingStatus: true },
  })

  return NextResponse.json({
    characters: rows.map((c) => ({
      id: c.id,
      name: c.name,
      selected_style_url: c.selectedStyleUrl,
      source_photo_url: c.sourcePhotoUrl,
      selected_style: c.selectedStyle,
      lora_training_status: c.loraTrainingStatus,
    })),
  })
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const formData = await req.formData()
  const file = formData.get("photo") as File | null
  const name = (formData.get("name") as string | null) ?? "My Character"
  const characterDescription = (formData.get("character_description") as string | null) ?? null

  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 })
  }

  // Bake EXIF orientation into pixel data and strip metadata. iPhone selfies
  // commonly have orientation=6 (rotate 90° for display); Flux/Kontext models
  // read raw pixels and misinterpret a sideways man as a reclining woman, so
  // the cartoon transform comes out badly wrong. Always normalize on upload.
  const rawBuffer = Buffer.from(await file.arrayBuffer())
  const buffer = await sharp(rawBuffer).rotate().jpeg({ quality: 92 }).toBuffer()
  const blobPath = `${userId}/characters/${Date.now()}-${file.name.replace(/\.[^.]+$/, "")}.jpg`

  // Auto-generate an identity-anchoring description via Claude vision unless the
  // user provided one. This description is injected into every downstream prompt
  // (style transfer, augmentation, scene gen) and dramatically improves identity
  // preservation: the model can't drop features it has been told are present.
  const [blobUrl, autoDescription] = await Promise.all([
    uploadBlob(blobPath, buffer, "image/jpeg"),
    characterDescription ? Promise.resolve(null) : describeCharacter(buffer, "image/jpeg"),
  ])
  const finalDescription = characterDescription ?? autoDescription

  const character = await prisma.character.create({
    data: { userId, name, sourcePhotoUrl: blobUrl, characterDescription: finalDescription },
  })

  return NextResponse.json({ character }, { status: 201 })
}
