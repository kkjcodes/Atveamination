import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { emit } from "@/lib/events"

// POST /api/business — create a new draft business. Called at the start of
// the onboarding form so subsequent field edits have a stable ID to attach
// to. Draft-first design is the resumability foundation: a user closing
// the tab after typing a name should return to that same draft, not start
// over.
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const body = await req.json().catch(() => ({})) as { name?: string; oneLiner?: string; address?: string; notes?: string }

  const business = await prisma.business.create({
    data: {
      userId,
      name: body.name?.trim() ?? "",
      oneLiner: body.oneLiner?.trim() ?? "",
      address: body.address?.trim() || null,
      notes: body.notes?.trim() || null,
      status: "draft",
    },
  })
  void emit("business_created", { businessId: business.id }, userId)
  return NextResponse.json({ business }, { status: 201 })
}
