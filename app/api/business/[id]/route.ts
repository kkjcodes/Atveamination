import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { deleteBlobsByPrefix } from "@/lib/storage/client"
import { logError } from "@/lib/logger"

// GET /api/business/[id] — full business + photos + logo for resume rendering.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const business = await prisma.business.findFirst({
    where: { id, userId: session.user.id },
    include: {
      logo: true,
    },
  })
  if (!business) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Photos are Asset rows with kind=product_photo tagged to this business via
  // the blob path prefix `business/<id>/photos/...`. Query by prefix so we
  // don't need a join table for the M1 shape.
  const photos = await prisma.asset.findMany({
    where: {
      userId: session.user.id,
      kind: "product_photo",
      blobPath: { startsWith: `business/${id}/photos/` },
    },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({ business, photos })
}

// PATCH /api/business/[id] — progressive save. Every field is optional; the
// form calls this after every input change (debounced) so no work is lost.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owned = await prisma.business.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const body = await req.json() as {
    name?: string
    oneLiner?: string
    address?: string | null
    notes?: string | null
    logoAssetId?: string | null
    status?: "draft" | "ready"
  }

  await prisma.business.update({
    where: { id },
    data: {
      ...(body.name !== undefined && { name: body.name.trim() }),
      ...(body.oneLiner !== undefined && { oneLiner: body.oneLiner.trim() }),
      ...(body.address !== undefined && { address: body.address ? body.address.trim() : null }),
      ...(body.notes !== undefined && { notes: body.notes ? body.notes.trim() : null }),
      ...(body.logoAssetId !== undefined && { logoAssetId: body.logoAssetId }),
      ...(body.status !== undefined && { status: body.status }),
    },
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const owned = await prisma.business.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true },
  })
  if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 })

  // Delete DB row first (Prisma cascades ads + adVersions). Then clean up
  // blobs by prefix. Blob cleanup is best-effort — a failure here logs but
  // doesn't fail the request, since the DB row is already gone and the
  // user's expectation ("this business is deleted") is met.
  await prisma.business.delete({ where: { id } })
  try {
    await deleteBlobsByPrefix(`business/${id}/`)
  } catch (e) {
    logError("/api/business/[id]", "delete_blobs", { businessId: id, userId: session.user.id }, e)
  }
  return NextResponse.json({ ok: true })
}
