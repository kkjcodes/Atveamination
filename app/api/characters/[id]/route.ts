import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { deleteBlob, deleteBlobsByPrefix, urlToBlobPath } from "@/lib/storage/client"

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const character = await prisma.character.findFirst({
    where: { id, userId },
    include: { options: true },
  })

  if (!character) {
    return NextResponse.json({ error: "Character not found" }, { status: 404 })
  }

  return NextResponse.json({
    character: {
      id: character.id,
      user_id: character.userId,
      name: character.name,
      source_photo_url: character.sourcePhotoUrl,
      selected_style_url: character.selectedStyleUrl,
      selected_style: character.selectedStyle,
      lora_version: character.loraVersion,
      lora_training_status: character.loraTrainingStatus,
      created_at: character.createdAt,
      options: character.options.map((o: { id: string; characterId: string; styleUrl: string; styleName: string }) => ({
        id: o.id,
        character_id: o.characterId,
        style_url: o.styleUrl,
        style_name: o.styleName,
      })),
    },
  })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const character = await prisma.character.findFirst({ where: { id, userId } })
  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 })

  const body = (await req.json()) as { character_description?: string | null; name?: string }
  const data: Record<string, unknown> = {}
  if ("character_description" in body) data.characterDescription = body.character_description ?? null
  if (body.name?.trim()) data.name = body.name.trim()

  const updated = await prisma.character.update({ where: { id }, data })
  return NextResponse.json({ character_description: updated.characterDescription, name: updated.name })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const character = await prisma.character.findFirst({ where: { id, userId } })
  if (!character) return NextResponse.json({ error: "Character not found" }, { status: 404 })

  // Fetch all projects (and their scenes) for this character to clean up blobs
  const projects = await prisma.project.findMany({
    where: { characterId: id },
    include: { scenes: { select: { id: true } } },
  })

  // Collect all Azure blob cleanup work before touching the DB
  const blobDeletes: Promise<void>[] = []

  // Character-level blobs: styles (characters/{id}/styles/*) and training (characters/{id}/training/*)
  blobDeletes.push(deleteBlobsByPrefix(`characters/${id}/`))

  // Source photo (path is embedded in the stored URL)
  const sourcePhotoPath = urlToBlobPath(character.sourcePhotoUrl)
  if (sourcePhotoPath) blobDeletes.push(deleteBlob(sourcePhotoPath))

  // Per-scene blobs and per-project final videos
  for (const project of projects) {
    for (const scene of project.scenes) {
      blobDeletes.push(
        deleteBlob(`scenes/${scene.id}/frame.jpg`),
        deleteBlob(`scenes/${scene.id}/audio.wav`),
        deleteBlob(`scenes/${scene.id}/clip.mp4`),
      )
    }
    blobDeletes.push(deleteBlob(`${userId}/projects/${project.id}/final.mp4`))
  }

  // Run all Azure deletions in parallel; missing blobs are silently ignored
  await Promise.allSettled(blobDeletes)

  // Best-effort Replicate LoRA model deletion via direct API call
  if (character.loraVersion) {
    const modelName = `atve-char-${id.slice(0, 8)}`
    fetch(`https://api.replicate.com/v1/models/${encodeURIComponent(userId)}/${encodeURIComponent(modelName)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}` },
    }).catch(() => {})
  }

  // Delete from DB (cascades to options via Prisma onDelete: Cascade)
  await prisma.character.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
