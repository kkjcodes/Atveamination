import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import type { UserRole } from "@prisma/client"

const VALID_ROLES: UserRole[] = ["FREE", "SUPER_USER", "ADMIN"]

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await params
  const { role } = await req.json() as { role: UserRole }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 })
  }

  // Prevent demoting yourself
  if (id === session.user.id && role !== "ADMIN") {
    return NextResponse.json({ error: "Cannot change your own role" }, { status: 403 })
  }

  const user = await prisma.user.update({
    where: { id },
    data: { role },
    select: { id: true, email: true, role: true },
  })

  return NextResponse.json({ user })
}
