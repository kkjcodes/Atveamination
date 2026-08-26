import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { uploadAssetFromFile, UploadValidationError } from "@/lib/business/upload"
import { classifyUpload } from "@/lib/business/classify-upload"
import { emit } from "@/lib/events"

const MIN_PHOTOS = 1
// 20 is a library cap, not a per-ad cap — businesses reuse a few evergreen
// shots (storefront, logo wall) and add a couple new ones per ad. Per-ad
// selection is capped separately in the ads route.
const MAX_PHOTOS = 20

// POST /api/business/[id]/photos — add product photos (1-20 total per business).
// Multipart with `photos` files. Server counts existing photos first so we
// enforce the cap even across multiple upload batches.
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

  const uploaded: Awaited<ReturnType<typeof uploadAssetFromFile>>[] = []
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

  // Classify each upload (photo/flyer/logo/watermarked) so the ad pipeline
  // routes it correctly — a flyer slow-zoomed as a scene was the defining
  // failure of the first customer ad. Cheap vision call; fails open to
  // "photo" so a hiccup never blocks the upload.
  const classified = await Promise.all(
    files.map(async (file, i) => {
      const buffer = Buffer.from(await file.arrayBuffer())
      const c = await classifyUpload(buffer, file.type)
      await prisma.asset.update({
        where: { id: uploaded[i].id },
        data: { contentClass: c.contentClass, extractedText: c.extractedText },
      }).catch(() => {})
      return { ...uploaded[i], contentClass: c.contentClass, extractedText: c.extractedText }
    }),
  )
  // Append at the end of the user's arranged order.
  const maxExisting = await prisma.asset.aggregate({
    where: {
      userId,
      kind: "product_photo",
      blobPath: { startsWith: `business/${businessId}/photos/` },
      id: { notIn: uploaded.map((a) => a.id) },
    },
    _max: { orderIndex: true },
  })
  const base = (maxExisting._max.orderIndex ?? -1) + 1
  await Promise.all(
    uploaded.map((a, i) => prisma.asset.update({ where: { id: a.id }, data: { orderIndex: base + i } })),
  )
  void emit("photos_uploaded", { businessId, count: uploaded.length }, userId)

  return NextResponse.json({ photos: classified }, { status: 201 })
}

// PATCH /api/business/[id]/photos — persist a user-arranged photo order.
// Body: { orderedAssetIds: string[] }. Each listed asset gets its array
// position as orderIndex; photos not listed keep their old index.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: businessId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({})) as { orderedAssetIds?: unknown }
  const ids = Array.isArray(body.orderedAssetIds)
    ? body.orderedAssetIds.filter((x): x is string => typeof x === "string")
    : []
  if (ids.length === 0) return NextResponse.json({ error: "orderedAssetIds required" }, { status: 400 })

  const owned = await prisma.asset.findMany({
    where: {
      id: { in: ids },
      userId,
      kind: "product_photo",
      blobPath: { startsWith: `business/${businessId}/photos/` },
    },
    select: { id: true },
  })
  const ownedIds = new Set(owned.map((a) => a.id))
  if (ids.some((id) => !ownedIds.has(id))) {
    return NextResponse.json({ error: "Unknown photo in order list" }, { status: 400 })
  }

  await prisma.$transaction(
    ids.map((id, i) => prisma.asset.update({ where: { id }, data: { orderIndex: i } })),
  )
  return NextResponse.json({ ok: true })
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
