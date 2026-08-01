import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { uploadAssetFromFile, UploadValidationError } from "@/lib/business/upload"

// POST /api/business/[id]/logo — upload the business logo (optional).
// Replaces any existing logo (previous Asset row is orphaned; cleanup job
// can sweep it later — for now we just point Business.logoAssetId at the new
// one, which is the source of truth for display).
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
  const file = form.get("logo") as File | null
  if (!file) return NextResponse.json({ error: "No logo file" }, { status: 400 })

  let asset
  try {
    asset = await uploadAssetFromFile(
      file,
      userId,
      "logo",
      `business/${businessId}/logo`,
    )
  } catch (e) {
    if (e instanceof UploadValidationError) {
      return NextResponse.json({ error: e.message }, { status: e.status })
    }
    throw e
  }
  await prisma.business.update({
    where: { id: businessId },
    data: { logoAssetId: asset.id },
  })

  return NextResponse.json({ logo: asset }, { status: 201 })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: businessId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  await prisma.business.updateMany({
    where: { id: businessId, userId: session.user.id },
    data: { logoAssetId: null },
  })
  return NextResponse.json({ ok: true })
}
