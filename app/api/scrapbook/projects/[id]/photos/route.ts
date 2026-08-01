import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { uploadBlob } from "@/lib/storage/client"
import sharp from "sharp"
import { MAX_PAGES_PER_PROJECT } from "@/lib/scrapbook/config"
import { validateImageFile, UploadValidationError } from "@/lib/business/upload"

// POST /api/scrapbook/projects/[id]/photos — add photos to a scrapbook.
//
// Two input modes (send either, or both in one call):
//   1. multipart/form-data with `photos` files — fresh uploads. EXIF-normalized
//      via sharp().rotate() (iPhone selfies are orientation=6 by default and
//      corrupt image-to-image models without this).
//   2. Query/body `character_ids[]` — reuse existing Character rows from the
//      user's library. Copies `character.sourcePhotoUrl` onto the new
//      ScrapbookPage.sourcePhotoUrl for a stable reference.
//
// Enforces MAX_PAGES_PER_PROJECT across existing + new pages.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const project = await prisma.scrapbookProject.findFirst({
    where: { id: projectId, userId },
    include: { _count: { select: { pages: true } } },
  })
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 })

  const contentType = req.headers.get("content-type") ?? ""
  const isMultipart = contentType.includes("multipart/form-data")

  let uploadedFiles: File[] = []
  let characterIds: string[] = []
  if (isMultipart) {
    const form = await req.formData()
    const filesEntries = form.getAll("photos").filter((v): v is File => v instanceof File)
    uploadedFiles = filesEntries
    const idsRaw = form.get("character_ids")
    if (typeof idsRaw === "string" && idsRaw.trim()) {
      try { characterIds = JSON.parse(idsRaw) as string[] } catch { /* ignore */ }
    }
  } else {
    const body = await req.json() as { character_ids?: string[] }
    characterIds = Array.isArray(body.character_ids) ? body.character_ids : []
  }

  const additions = uploadedFiles.length + characterIds.length
  if (additions === 0) {
    return NextResponse.json({ error: "No photos or character_ids provided" }, { status: 400 })
  }
  if (project._count.pages + additions > MAX_PAGES_PER_PROJECT) {
    return NextResponse.json(
      { error: `Max ${MAX_PAGES_PER_PROJECT} photos per scrapbook` },
      { status: 400 },
    )
  }

  // Verify character ownership up front.
  const validCharacters = characterIds.length > 0
    ? await prisma.character.findMany({
        where: { id: { in: characterIds }, userId },
        select: { id: true, sourcePhotoUrl: true },
      })
    : []
  if (validCharacters.length !== characterIds.length) {
    return NextResponse.json({ error: "One or more characters not found" }, { status: 404 })
  }

  const startIndex = project._count.pages
  const newPageInputs: Array<{ sourcePhotoUrl: string; characterId: string | null }> = []

  // 1. Normalize + upload fresh photos. Validation runs BEFORE the byte read
  // so oversized / wrong-MIME files 413/415 without allocating a buffer.
  try {
    for (const file of uploadedFiles) {
      validateImageFile(file)
      const rawBuffer = Buffer.from(await file.arrayBuffer())
      // Pixel-density check to prevent decompression bombs.
      const meta = await sharp(rawBuffer).metadata()
      const pixels = (meta.width ?? 0) * (meta.height ?? 0)
      if (pixels > 40 * 1_000_000) {
        throw new UploadValidationError(413, `Image too high-resolution (${meta.width}×${meta.height})`)
      }
      const buffer = await sharp(rawBuffer).rotate().jpeg({ quality: 92 }).toBuffer()
      const url = await uploadBlob(
        `scrapbook/${projectId}/sources/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`,
        buffer,
        "image/jpeg",
      )
      newPageInputs.push({ sourcePhotoUrl: url, characterId: null })
    }
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }

  // 2. Library characters — copy sourcePhotoUrl reference (character was
  // already EXIF-normalized when created).
  for (const c of validCharacters) {
    newPageInputs.push({ sourcePhotoUrl: c.sourcePhotoUrl, characterId: c.id })
  }

  const created = await prisma.$transaction(
    newPageInputs.map((p, i) =>
      prisma.scrapbookPage.create({
        data: {
          projectId,
          orderIndex: startIndex + i,
          sourcePhotoUrl: p.sourcePhotoUrl,
          characterId: p.characterId,
        },
      }),
    ),
  )

  return NextResponse.json({ pages: created }, { status: 201 })
}
