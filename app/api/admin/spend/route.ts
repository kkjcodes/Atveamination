import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { spendSummary } from "@/lib/budget/guard"

function startOfDayUTC(daysAgo = 0): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d
}

// GET /api/admin/spend — budget guard status + per-provider split + 7-day trend.
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const summary = await spendSummary()

  const byProvider = await prisma.spendLedger.groupBy({
    by: ["provider"],
    _sum: { estimatedCostUsd: true },
    _count: true,
    where: { createdAt: { gte: startOfDayUTC(30) } },
  })

  const days: Array<{ day: string; usd: number }> = []
  for (let i = 6; i >= 0; i--) {
    const from = startOfDayUTC(i)
    const to = startOfDayUTC(i - 1)
    const agg = await prisma.spendLedger.aggregate({
      _sum: { estimatedCostUsd: true },
      where: { createdAt: { gte: from, lt: to } },
    })
    days.push({ day: from.toISOString().slice(0, 10), usd: agg._sum.estimatedCostUsd ?? 0 })
  }

  return NextResponse.json({
    summary,
    byProvider: byProvider.map((p) => ({
      provider: p.provider,
      usd30d: p._sum.estimatedCostUsd ?? 0,
      calls30d: p._count,
    })),
    last7Days: days,
  })
}
