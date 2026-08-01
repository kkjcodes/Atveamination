// Shared optimistic-lock primitive for async work. Every long-running
// operation (augment, train, render, page-generate, stitch, future music-gen)
// follows the same claim protocol:
//
//   1. If a "fresh" attempt is in-flight (started within staleAfterMs), 409.
//   2. Otherwise, atomically claim the row (updateMany with a guard), setting
//      status="processing" and startedAt=now.
//   3. Caller returns 202 and fires the actual work in the background.
//
// The claim callback is model-specific — this helper doesn't know Prisma
// generic types across ScrapbookProject / Character / Ad / ScrapbookPage,
// but the orchestration logic is identical.

export type ClaimDecision =
  | { ok: true; wasStale: boolean }
  | { ok: false; reason: "fresh_in_flight" }

export type ClaimParams = {
  // Current DB state (fetched by caller before calling).
  currentStatus: string | null
  currentStartedAt: Date | null
  // Which status value indicates "actively running work".
  activeStatus: string
  // How long the caller expects the work to normally take, plus slack.
  // Anything older than this AND still in activeStatus is considered a
  // container-crashed leftover, and is safe to reclaim.
  staleAfterMs: number
  // Model-specific atomic update: caller does the Prisma updateMany with
  // its own WHERE clause and returns the count of rows updated. Must set
  // the status field to activeStatus AND startedAt to a fresh Date.
  claim: () => Promise<number>
}

export async function claimAsyncWork(params: ClaimParams): Promise<ClaimDecision> {
  const { currentStatus, currentStartedAt, activeStatus, staleAfterMs, claim } = params

  const isFreshInFlight =
    currentStatus === activeStatus &&
    currentStartedAt !== null &&
    Date.now() - currentStartedAt.getTime() < staleAfterMs

  if (isFreshInFlight) {
    return { ok: false, reason: "fresh_in_flight" }
  }

  const wasStale = currentStatus === activeStatus // in activeStatus but not fresh → stale
  const updated = await claim()
  if (updated === 0) {
    // Row raced us — someone else claimed it between our read and write.
    return { ok: false, reason: "fresh_in_flight" }
  }
  return { ok: true, wasStale }
}

// Convenience thresholds. Tune per operation based on measured p99 duration.
export const STALE_WINDOWS = {
  scrapbookPage: 8 * 60 * 1000,      // 8 min — RIFE + Kontext, p99 ~4min
  scrapbookStitch: 10 * 60 * 1000,   // 10 min — 8-page assembly on 1vCPU
  characterAugment: 15 * 60 * 1000,  // 15 min — 35 Kontext calls
  characterTrain: 30 * 60 * 1000,    // 30 min — fal LoRA training p99
  businessRender: 5 * 60 * 1000,     // 5 min — video render, p99 ~90s
} as const
