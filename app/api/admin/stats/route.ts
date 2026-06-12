import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"

function startOfDayUTC(daysAgo = 0): Date {
  const d = new Date()
  d.setUTCHours(0, 0, 0, 0)
  d.setUTCDate(d.getUTCDate() - daysAgo)
  return d
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const thirtyDaysAgo = startOfDayUTC(30)
  const sevenDaysAgo  = startOfDayUTC(7)
  const todayStart    = startOfDayUTC(0)
  const yesterday     = startOfDayUTC(1)

  const [
    totalUsers,
    totalProjects,
    totalScenes,
    completedScenes,
    totalCharacters,
    totalVoices,
    stitchedVideos,
    newUsersToday,
    newUsersYesterday,
    activeUsersToday,
    activeUsers7d,
    activeUsers30d,
    usersByRole,
    recentUsers,
    dailyUsers,
    dailyScenes,
    dailyProjects,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.project.count(),
    prisma.scene.count(),
    prisma.scene.count({ where: { generationPhase: "done" } }),
    prisma.character.count(),
    prisma.voice.count(),
    prisma.project.count({ where: { finalVideoUrl: { not: null } } }),
    prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
    prisma.user.count({ where: { createdAt: { gte: yesterday, lt: todayStart } } }),
    // Active = had at least one job today
    prisma.job.groupBy({ by: ["userId"], where: { createdAt: { gte: todayStart } } }).then((r) => r.length),
    prisma.job.groupBy({ by: ["userId"], where: { createdAt: { gte: sevenDaysAgo } } }).then((r) => r.length),
    prisma.job.groupBy({ by: ["userId"], where: { createdAt: { gte: thirtyDaysAgo } } }).then((r) => r.length),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    }),
    // Daily new users for last 30 days
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS day,
             COUNT(*)::int AS count
      FROM users
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY day ORDER BY day ASC
    `,
    // Daily scene completions for last 30 days
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS day,
             COUNT(*)::int AS count
      FROM scenes
      WHERE generation_phase = 'done' AND created_at >= ${thirtyDaysAgo}
      GROUP BY day ORDER BY day ASC
    `,
    // Daily projects for last 30 days
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS day,
             COUNT(*)::int AS count
      FROM projects
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY day ORDER BY day ASC
    `,
  ])

  const successRate = totalScenes > 0
    ? Math.round((completedScenes / totalScenes) * 100)
    : 0

  return NextResponse.json({
    totals: {
      users: totalUsers,
      projects: totalProjects,
      scenes: totalScenes,
      completedScenes,
      characters: totalCharacters,
      voices: totalVoices,
      stitchedVideos,
      successRate,
    },
    today: {
      newUsers: newUsersToday,
      newUsersYesterday,
      activeUsers: activeUsersToday,
    },
    activity: {
      activeUsers7d,
      activeUsers30d,
    },
    usersByRole: Object.fromEntries(
      usersByRole.map((r) => [r.role, r._count._all])
    ),
    recentUsers,
    charts: { dailyUsers, dailyScenes, dailyProjects },
  })
}
