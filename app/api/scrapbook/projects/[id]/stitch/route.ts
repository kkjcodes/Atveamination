import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { assembleScrapbook, type PageInput } from "@/lib/scrapbook/assemble"
import { claimAsyncWork, STALE_WINDOWS } from "@/lib/async-work/claim"
import { fireAndForget } from "@/lib/async-work/fire"

// Fire-and-forget assembly via shared async-work primitives. Was hitting
// Cloudflare 524 when sync-blocking. See lib/async-work/claim.ts and
// lib/async-work/fire.ts for the shared contract.
export const maxDuration = 30

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const project = await prisma.scrapbookProject.findFirst({
    where: { id: projectId, userId },
    include: { pages: { orderBy: { orderIndex: "asc" } } },
  })
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (project.pages.length === 0) {
    return NextResponse.json({ error: "No pages to assemble" }, { status: 400 })
  }

  const stillGenerating = project.pages.some(
    (p) => p.generationPhase !== "done" && p.generationPhase !== "failed",
  )
  if (stillGenerating) {
    return NextResponse.json(
      { error: "Some pages are still generating" },
      { status: 400 },
    )
  }

  const pageInputs: PageInput[] = project.pages.map((p) => {
    const qcPassed = (p.qcResult as { passed?: boolean } | null)?.passed === true
    if (qcPassed && p.rawClipUrl) {
      return { kind: "clip", url: p.rawClipUrl, caption: p.caption }
    }
    const stillUrl = p.beforeKeyframeUrl ?? p.sourcePhotoUrl
    return { kind: "still", url: stillUrl, caption: p.caption }
  })

  // Shared claim contract — replaces the bespoke isFreshGenerating check
  // and updateMany that used to live inline here.
  const decision = await claimAsyncWork({
    currentStatus: project.status,
    currentStartedAt: project.stitchStartedAt,
    activeStatus: "generating",
    staleAfterMs: STALE_WINDOWS.scrapbookStitch,
    claim: async () => {
      const staleThreshold = new Date(Date.now() - STALE_WINDOWS.scrapbookStitch)
      const res = await prisma.scrapbookProject.updateMany({
        where: {
          id: projectId,
          userId,
          OR: [
            { status: { not: "generating" } },
            { stitchStartedAt: { lt: staleThreshold } },
            { stitchStartedAt: null },
          ],
        },
        data: {
          status: "generating",
          stitchStartedAt: new Date(),
          stitchFailureCode: null,
          stitchFailureMessage: null,
        },
      })
      return res.count
    },
  })
  if (!decision.ok) {
    return NextResponse.json({ error: "Assembly already in progress" }, { status: 409 })
  }

  fireAndForget({
    tag: "scrapbook/stitch",
    id: projectId,
    work: async () => {
      const finalVideoUrl = await assembleScrapbook(pageInputs, projectId)
      const totalCost = project.pages.reduce((sum, p) => sum + p.costUsd, 0)
      await prisma.scrapbookProject.update({
        where: { id: projectId },
        data: {
          status: "done",
          finalVideoUrl,
          totalCostUsd: totalCost,
          stitchStartedAt: null,
          stitchFailureCode: null,
          stitchFailureMessage: null,
        },
      })
    },
    onError: async (err) => {
      await prisma.scrapbookProject.update({
        where: { id: projectId },
        data: {
          status: "failed",
          stitchStartedAt: null,
          stitchFailureCode: err.code,
          stitchFailureMessage: err.message,
        },
      })
    },
  })

  return NextResponse.json({ status: "generating", projectId, reclaimedStale: decision.wasStale }, { status: 202 })
}
