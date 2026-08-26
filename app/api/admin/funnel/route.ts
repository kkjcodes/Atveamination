import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

// GET /api/admin/funnel — D1 funnel counts + drop-offs and D2 latency
// percentiles, in one payload for the admin dashboard.

const FUNNEL_ORDER = [
  "landing_view",
  "demo_started",
  "demo_completed",
  "signup_started",
  "signup_completed",
  "first_video_started",
  "first_video_completed",
  "share_clicked",
  "download_clicked",
] as const

function daysAgo(n: number): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - n)
  return d
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

async function funnelCounts(since: Date) {
  const rows = await prisma.event.groupBy({
    by: ["name"],
    _count: true,
    where: { name: { in: [...FUNNEL_ORDER] }, createdAt: { gte: since } },
  })
  const byName = new Map(rows.map((r) => [r.name, r._count]))
  return FUNNEL_ORDER.map((name, i) => {
    const count = byName.get(name) ?? 0
    const prev = i > 0 ? (byName.get(FUNNEL_ORDER[i - 1]) ?? 0) : null
    return {
      step: name,
      count,
      // Conversion from the previous step (share/download aren't strictly
      // sequential after completion, but the ratio is still informative).
      fromPrevPct: prev && prev > 0 ? Math.round((count / prev) * 100) : null,
    }
  })
}

async function latency(name: "render_timing" | "scene_timing", key: string) {
  const rows = await prisma.event.findMany({
    where: { name, createdAt: { gte: daysAgo(30) } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { props: true },
  })
  const vals = rows
    .map((r) => (r.props as Record<string, unknown> | null)?.[key])
    .filter((v): v is number => typeof v === "number" && v > 0)
    .sort((a, b) => a - b)
  return {
    n: vals.length,
    p50: percentile(vals, 50),
    p90: percentile(vals, 90),
    p99: percentile(vals, 99),
  }
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const [funnel7, funnel30, businessRender, sceneWallClock] = await Promise.all([
    funnelCounts(daysAgo(7)),
    funnelCounts(daysAgo(30)),
    latency("render_timing", "totalMs"),
    latency("scene_timing", "totalMs"),
  ])

  return NextResponse.json({ funnel7, funnel30, latency: { businessRender, sceneWallClock } })
}
