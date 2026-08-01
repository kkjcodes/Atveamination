// Standard fire-and-forget wrapper for the "kick off work, respond 202,
// finish in the background" pattern. Ensures errors are always caught and
// persisted so status columns never leak an unhandled promise.
//
// Node keeps the pending promise alive past the HTTP response. On Container
// Apps the container stays warm as long as SOMETHING keeps traffic hitting
// it — during typical use the client's poll loop covers that. If the
// container is idle mid-work and gets a scale-to-zero SIGTERM, the promise
// dies; the stale-recovery threshold in claimAsyncWork lets the next click
// reclaim the row.

import { mapProviderError, type UserFacingError } from "./errors"

export type FireAndForgetParams = {
  // Tag for logging — usually "<module>/<operation>", e.g. "scrapbook/stitch".
  tag: string
  // Correlation id for the specific entity being worked on.
  id: string
  // The actual work to perform.
  work: () => Promise<void>
  // Called with a mapped user-facing error whenever `work` throws.
  // Must persist the failure (status=failed + failureCode + failureMessage).
  // The onError callback itself is NOT allowed to throw — wrap in try/catch
  // if the persistence itself might fail.
  onError: (err: UserFacingError, rawError: unknown) => Promise<void>
  // Optional: called on successful completion. Use for cleanup / metrics.
  onSuccess?: () => Promise<void>
}

export function fireAndForget(params: FireAndForgetParams): void {
  const start = Date.now()
  const { tag, id, work, onError, onSuccess } = params
  console.log(`[${tag}] KICKOFF id=${id}`)

  void (async () => {
    try {
      await work()
      console.log(`[${tag}] DONE id=${id} ${Date.now() - start}ms`)
      if (onSuccess) {
        try { await onSuccess() } catch (e) {
          console.error(`[${tag}] onSuccess handler failed id=${id}:`, (e as Error)?.message)
        }
      }
    } catch (e) {
      const mapped = mapProviderError(e)
      const raw = e instanceof Error ? e.message : String(e)
      console.error(`[${tag}] FAILED id=${id} after ${Date.now() - start}ms code=${mapped.code} raw="${raw}"`)
      try {
        await onError(mapped, e)
      } catch (persistErr) {
        // Last-ditch — if we can't even persist the failure, the row will
        // eventually be reclaimed by stale-recovery.
        console.error(`[${tag}] onError handler failed id=${id}:`, (persistErr as Error)?.message)
      }
    }
  })()
}
