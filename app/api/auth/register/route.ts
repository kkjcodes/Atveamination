import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/db/client"
import { rateLimit } from "@/lib/rate-limit"

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const rl = rateLimit(`register:${ip}`, 5, 60 * 60 * 1000)
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests. Try again later." }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
    })
  }

  const body = await request.json()
  const { email, password, name, segment } = body as {
    email: string
    password: string
    name?: string
    // segment: which audience the user came in through. Persisted so
    // admin/metrics can show signup breakdown by door. Optional (users who
    // land directly on /auth/signup with no ?redirect= won't have one).
    segment?: string
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 })
  }

  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 })
  }

  // Segment must match the DB enum: "family" | "business" | "both". The
  // client sends "personal" for the consumer door (matches the URL), so we
  // map it here. Anything unrecognized is dropped.
  const segmentMap: Record<string, "family" | "business"> = {
    personal: "family",
    family: "family",
    business: "business",
  }
  const validSegment = segment && segmentMap[segment] ? segmentMap[segment] : undefined

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      email,
      password: hashed,
      name: name ?? null,
      ...(validSegment && { segment: validSegment, segmentPickedAt: new Date() }),
    },
    select: { id: true, email: true, name: true },
  })

  return NextResponse.json({ user }, { status: 201 })
}
