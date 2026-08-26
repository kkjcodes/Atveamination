import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { emit, type EventName } from "@/lib/events"
import { rateLimit } from "@/lib/rate-limit"
import { hashIp } from "@/lib/demo/generate"

// POST /api/track — client-side funnel events (D1). Anonymous-friendly:
// an unauthenticated landing view is exactly the point of the funnel. Only
// the allowlisted funnel names are accepted; anything else is dropped so
// this can never become a general write-anything endpoint.
const FUNNEL_EVENTS: ReadonlySet<string> = new Set([
  "landing_view",
  "demo_started",
  "demo_completed",
  "signup_started",
  "share_clicked",
  "download_clicked",
])

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown"
  const rl = rateLimit(`track:${hashIp(ip)}`, 120, 60 * 60 * 1000)
  if (!rl.allowed) return NextResponse.json({ ok: true }) // silently drop; never error a page

  const body = await req.json().catch(() => null) as { name?: string; sid?: string; props?: Record<string, unknown> } | null
  if (!body?.name || !FUNNEL_EVENTS.has(body.name)) {
    return NextResponse.json({ ok: true })
  }
  const sid = typeof body.sid === "string" ? body.sid.slice(0, 40) : null
  const session = await getServerSession(authOptions).catch(() => null)

  void emit(body.name as EventName, { sid, ...sanitize(body.props) }, session?.user?.id ?? null)
  return NextResponse.json({ ok: true })
}

// Only carry a few known scalar props — never arbitrary client payloads.
function sanitize(props: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!props) return {}
  const out: Record<string, unknown> = {}
  for (const key of ["page", "style", "target"]) {
    const v = props[key]
    if (typeof v === "string") out[key] = v.slice(0, 60)
  }
  return out
}
