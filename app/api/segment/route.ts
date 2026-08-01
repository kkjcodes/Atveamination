import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { emit } from "@/lib/events"

// POST /api/segment — record which "door" the user picked at the landing
// fork. Callable both by authenticated and unauthenticated users (returns 200
// no-op for anon so the fork UI can fire-and-forget).
//
// Resumability: if a family user picks the business door (or vice versa),
// segment transitions to "both" instead of overwriting — so a user who came
// through the family door and later explored business still shows up in
// family analytics too.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const picked = body?.segment
  if (picked !== "family" && picked !== "business") {
    return NextResponse.json({ error: "segment must be 'family' or 'business'" }, { status: 400 })
  }

  const session = await getServerSession(authOptions)
  void emit("flow_entered", { door: picked }, session?.user.id ?? null)

  if (!session) {
    // Anonymous — nothing to persist. UI still routes correctly.
    return NextResponse.json({ ok: true, persisted: false })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { segment: true, segmentPickedAt: true },
  })
  if (!user) return NextResponse.json({ ok: true, persisted: false })

  // Segment merge logic: null → picked; picked already set to same → no-op;
  // picked already set to the OTHER door → upgrade to "both".
  let next: "family" | "business" | "both" = picked
  if (user.segment === "both") next = "both"
  else if (user.segment && user.segment !== picked) next = "both"

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      segment: next,
      // Only record picked-at on first pick; keep the original timestamp
      // for existing users who cross over to "both" later.
      segmentPickedAt: user.segmentPickedAt ?? new Date(),
    },
  })
  return NextResponse.json({ ok: true, persisted: true, segment: next })
}
