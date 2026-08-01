import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { uploadAssetFromFile, UploadValidationError } from "@/lib/business/upload"
import { emit } from "@/lib/events"

const MIN_PHOTOS = 1
const MAX_PHOTOS = 5

// POST /api/business/[id]/photos — add product photos (1-5 total per business).
// Multipart with `photos` files. Server counts existing photos first so we
// enforce the 5-cap even across multiple upload batches.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: businessId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const business = await prisma.business.findFirst({
    where: { id: businessId, userId },
    select: { id: true },
  })
  if (!business) return NextResponse.json({ error: "Business not found" }, { status: 404 })

  const form = await req.formData()
  const files = form.getAll("photos").filter((v): v is File => v instanceof File)
  if (files.length === 0) {
    return NextResponse.json({ error: "No photos in request" }, { status: 400 })
  }

  const existingCount = await prisma.asset.count({
    where: {
      userId,
      kind: "product_photo",
      blobPath: { startsWith: `business/${businessId}/photos/` },
    },
  })

  if (existingCount + files.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Max ${MAX_PHOTOS} photos per business (${existingCount} already saved).` },
      { status: 400 },
    )
  }

  const uploaded = []
  try {
    for (const file of files) {
      const asset = await uploadAssetFromFile(
        file,
        userId,
        "product_photo",
        `business/${businessId}/photos`,
      )
      uploaded.push(asset)
    }
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
  void emit("photos_uploaded", { businessId, count: uploaded.length }, userId)

  return NextResponse.json({ photos: uploaded }, { status: 201 })
}

// DELETE /api/business/[id]/photos?assetId=xxx — remove a product photo.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: businessId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const assetId = new URL(req.url).searchParams.get("assetId")
  if (!assetId) return NextResponse.json({ error: "assetId required" }, { status: 400 })

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId, kind: "product_photo" },
  })
  if (!asset || !asset.blobPath.startsWith(`business/${businessId}/photos/`)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  await prisma.asset.delete({ where: { id: asset.id } })
  return NextResponse.json({ ok: true })
}

export { MIN_PHOTOS, MAX_PHOTOS }
