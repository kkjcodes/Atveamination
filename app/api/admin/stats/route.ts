import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { medianIterationsPerAd, galleryOptInRate } from "@/lib/events"

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
    totalBusinesses,
    totalAds,
    adsReady,
    rendersCompleted,
    medianIterations,
    galleryOptIn,
    totalScrapbooks,
    scrapbooksDone,
    scrapbooksFailed,
    scrapbooksGenerating,
    scrapbookSpend,
    scrapbookPagesRendered,
    dailyAds,
    dailyScrapbooks,
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
    // Business fork
    prisma.business.count(),
    prisma.ad.count(),
    prisma.ad.count({ where: { status: "ready" } }),
    prisma.event.count({ where: { name: "render_completed" } }),
    medianIterationsPerAd(),
    galleryOptInRate(),
    // Scrapbook fork
    prisma.scrapbookProject.count(),
    prisma.scrapbookProject.count({ where: { status: "done" } }),
    prisma.scrapbookProject.count({ where: { status: "failed" } }),
    prisma.scrapbookProject.count({ where: { status: "generating" } }),
    prisma.scrapbookProject.aggregate({ _sum: { totalCostUsd: true } }),
    prisma.scrapbookPage.count({ where: { pageVideoUrl: { not: null } } }),
    // Daily ads for last 30 days
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS day,
             COUNT(*)::int AS count
      FROM ads
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY day ORDER BY day ASC
    `,
    // Daily scrapbooks for last 30 days
    prisma.$queryRaw<{ day: string; count: number }[]>`
      SELECT DATE_TRUNC('day', created_at AT TIME ZONE 'UTC')::date::text AS day,
             COUNT(*)::int AS count
      FROM scrapbook_projects
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY day ORDER BY day ASC
    `,
  ])

  const successRate = totalScenes > 0
    ? Math.round((completedScenes / totalScenes) * 100)
    : 0

  const scrapbookAttempts = scrapbooksDone + scrapbooksFailed
  const scrapbookSuccessRate = scrapbookAttempts > 0
    ? Math.round((scrapbooksDone / scrapbookAttempts) * 100)
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
    business: {
      businesses: totalBusinesses,
      ads: totalAds,
      adsReady,
      renders: rendersCompleted,
      medianIterations,
      galleryOptInRate: galleryOptIn,
    },
    scrapbook: {
      total: totalScrapbooks,
      completed: scrapbooksDone,
      failed: scrapbooksFailed,
      inProgress: scrapbooksGenerating,
      successRate: scrapbookSuccessRate,
      pagesRendered: scrapbookPagesRendered,
      totalCostUsd: scrapbookSpend._sum.totalCostUsd ?? 0,
    },
    combined: {
      // One "video delivered" per product family: stitched personal MP4s,
      // ads that reached ready, scrapbooks that reached done.
      videosDelivered: stitchedVideos + adsReady + scrapbooksDone,
    },
    charts: { dailyUsers, dailyScenes, dailyProjects, dailyAds, dailyScrapbooks },
  })
}
