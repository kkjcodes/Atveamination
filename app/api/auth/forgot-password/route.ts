import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db/client"
import { randomBytes } from "crypto"
import { sendEmail, passwordResetEmail } from "@/lib/email/client"
import { rateLimit } from "@/lib/rate-limit"

const TOKEN_TTL_MS = 60 * 60 * 1000 // 1 hour

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const rl = rateLimit(`forgot:${ip}`, 3, 60 * 60 * 1000)
  if (!rl.allowed) {
    // Return ok to keep user-enumeration protection intact
    return NextResponse.json({ ok: true })
  }

  const { email } = await req.json() as { email?: string }
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 })

  // Always return success to avoid user enumeration
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return NextResponse.json({ ok: true })

  const token  = randomBytes(32).toString("hex")
  const expiry = new Date(Date.now() + TOKEN_TTL_MS)

  await prisma.user.update({
    where: { id: user.id },
    data:  { passwordResetToken: token, passwordResetExpiry: expiry },
  })

  const appUrl   = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const resetUrl = `${appUrl}/auth/reset-password?token=${token}`

  try {
    await sendEmail(email, "Reset your AtVeAnimation password", passwordResetEmail(resetUrl))
  } catch (e) {
    console.error("[forgot-password] email send failed:", (e as Error).message)
    // Don't surface email errors to the client
  }

  return NextResponse.json({ ok: true })
}
