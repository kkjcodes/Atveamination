import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { runPagePipeline } from "@/lib/scrapbook/pipeline"
import { checkScrapbookLimit, logUsage, killSwitchEngaged } from "@/lib/limits"
import { emit } from "@/lib/events"
import { claimAsyncWork, STALE_WINDOWS } from "@/lib/async-work/claim"
import { fireAndForget } from "@/lib/async-work/fire"

export const maxDuration = 30

// POST /api/scrapbook/pages/[id]/generate — kick off pipeline for one page.
// Returns 202 immediately. Pipeline (vision + before + after + RIFE + QC or
// WAN submit) runs fire-and-forget. Client already polls GET
// /api/scrapbook/pages/[id] and the project endpoint at 4s intervals while
// generationPhase is anything but "done" | "failed" | null.
//
// Why async: sync execution hit Cloudflare's ~100s origin timeout when the
// subtle path's RIFE call took >70s on a specific input (observed as 524
// on page 6 of E2E). Same class of bug as the scrapbook stitch endpoint —
// long-running work should never block the HTTP response.
//
// Quota accounting: A scrapbook is billed on the FIRST page-generate call
// per project (not per page, not on final stitch). This closes the review
// finding — previously a user could generate every page (paying $2-5 of AI
// spend per project) and skip stitch to never count against the 5/day cap.
// We use INSERT-if-not-exists on a `Job` row keyed on the projectId as an
// atomic reservation ledger — concurrent first-page-generate calls only
// succeed for one, so quota can't be beat by racing.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  // Global kill switch (env or auto-trip on runaway model calls).
  const kill = await killSwitchEngaged()
  if (kill.engaged) {
    void emit("kill_switch_tripped", { route: "scrapbook_page_generate", reason: kill.reason })
    return NextResponse.json({ error: "Scrapbook generation is temporarily paused." }, { status: 503 })
  }

  const page = await prisma.scrapbookPage.findFirst({
    where: { id },
    include: { project: { select: { id: true, userId: true } } },
  })
  if (!page || page.project.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  // Charge-on-first-generate: check whether this project has already been
  // charged. Uses Job row with type="scrapbook_generate" + entityId=projectId
  // as the source of truth. If none exists, atomically reserve one — the
  // unique constraint (entityId + type) ensures only one wins on race.
  const projectId = page.project.id
  const alreadyCharged = await prisma.job.findFirst({
    where: { type: "scrapbook_generate", entityId: projectId },
    select: { id: true },
  })
  if (!alreadyCharged) {
    const limit = await checkScrapbookLimit(userId, session.user.role)
    if (!limit.allowed) {
      void emit("quota_reached", { segment: "scrapbook", used: limit.used, limit: limit.limit }, userId)
      return NextResponse.json(
        { error: "Daily scrapbook limit reached.", used: limit.used, limit: limit.limit, resetsAt: limit.resetsAt },
        { status: 429 },
      )
    }
    // Reserve BEFORE the pipeline runs. Failure to reserve = another request
    // beat us to it (race); in that case we just proceed (already charged).
    await logUsage(userId, "scrapbook_generate", projectId, "scrapbook_project").catch(() => {
      // Race: another concurrent request already logged. Fine — we don't
      // want to double-charge, so treat as already-charged.
    })
  }

  // Shared claim contract. Non-terminal phases are all considered "processing"
  // for the purpose of the freshness check — vision, before, after, motion, qc
  // are all in-flight states.
  const nonTerminalPhases = ["vision", "before", "after", "motion", "qc"]
  const currentPhaseIsActive = page.generationPhase && nonTerminalPhases.includes(page.generationPhase)

  const decision = await claimAsyncWork({
    currentStatus: currentPhaseIsActive ? "processing" : (page.generationPhase ?? null),
    currentStartedAt: page.generationStartedAt,
    activeStatus: "processing",
    staleAfterMs: STALE_WINDOWS.scrapbookPage,
    claim: async () => {
      const staleThreshold = new Date(Date.now() - STALE_WINDOWS.scrapbookPage)
      const res = await prisma.scrapbookPage.updateMany({
        where: {
          id,
          OR: [
            { generationPhase: null },
            { generationPhase: { in: ["done", "failed"] } },
            { generationStartedAt: { lt: staleThreshold } },
            { generationStartedAt: null },
          ],
        },
        data: {
          generationPhase: "vision",
          generationStartedAt: new Date(),
          generationFailureCode: null,
          generationFailureMessage: null,
        },
      })
      return res.count
    },
  })
  if (!decision.ok) {
    return NextResponse.json({ error: "Generation already in progress" }, { status: 409 })
  }

  fireAndForget({
    tag: "scrapbook/generate",
    id,
    work: async () => {
      // IMPORTANT: do NOT clear generationStartedAt on success. The pipeline
      // may return "successfully" while still in-flight (dynamic route hands
      // off to the fal webhook at phase="motion"). Clearing startedAt here
      // would make the stale-recovery check treat the in-flight row as
      // reclaimable and submit duplicate paid fal work. Terminal clears
      // happen in runQcAndFinalize (subtle) and the fal webhook (dynamic
      // completion) and pipeline's fallback paths.
      await runPagePipeline(id)
    },
    onError: async (err) => {
      await prisma.scrapbookPage.update({
        where: { id },
        data: {
          generationPhase: "failed",
          generationStartedAt: null,
          generationFailureCode: err.code,
          generationFailureMessage: err.message,
        },
      })
    },
  })

  return NextResponse.json({ status: "processing", pageId: id, reclaimedStale: decision.wasStale }, { status: 202 })
}
