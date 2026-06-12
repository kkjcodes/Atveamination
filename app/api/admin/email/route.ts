import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { sendEmail, adminContactEmail } from "@/lib/email/client"

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { to, userId, subject, body } = await req.json() as {
    to: "all" | "single"
    userId?: string
    subject: string
    body: string
  }

  if (!subject?.trim() || !body?.trim()) {
    return NextResponse.json({ error: "Subject and body required" }, { status: 400 })
  }

  let recipients: string[]

  if (to === "all") {
    const users = await prisma.user.findMany({ select: { email: true } })
    recipients = users.map((u) => u.email)
  } else {
    if (!userId) return NextResponse.json({ error: "userId required for single send" }, { status: 400 })
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })
    recipients = [user.email]
  }

  const html    = adminContactEmail(subject, body)
  const results = await Promise.allSettled(
    recipients.map((email) => sendEmail(email, subject, html))
  )

  const failed = results.filter((r) => r.status === "rejected").length

  return NextResponse.json({ sent: recipients.length - failed, failed })
}
