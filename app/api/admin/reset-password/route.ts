import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/client"
import bcrypt from "bcryptjs"
import { randomBytes } from "crypto"
import { timingSafeEqual } from "crypto"

const ADMIN_EMAIL = "admin@atveanimation.com"

function generateOTP(): string {
  return Array.from({ length: 4 }, () =>
    randomBytes(3).toString("base64url").slice(0, 4)
  ).join("-")
}

export async function POST(req: NextRequest) {
  const resetSecret = process.env.ADMIN_RESET_SECRET
  if (!resetSecret) return NextResponse.json({ error: "Not configured" }, { status: 503 })

  const { secret } = await req.json() as { secret?: string }
  if (!secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let valid = false
  try {
    valid = timingSafeEqual(Buffer.from(secret), Buffer.from(resetSecret))
  } catch { valid = false }

  if (!valid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const otp    = generateOTP()
  const hashed = await bcrypt.hash(otp, 12)

  await prisma.user.update({
    where: { email: ADMIN_EMAIL },
    data:  { password: hashed },
  })

  return NextResponse.json({ password: otp })
}
