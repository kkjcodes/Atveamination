import { isBudgetError } from "@/lib/budget/guard"

// One shared failure taxonomy (D3) — the HeyGen lesson: a single retry
// policy that distinguishes error classes beats per-call-site ad hoc logic.
//
//   transient — provider hiccup (5xx, timeout, queue congestion). Retryable;
//               restores the user's quota (A3).
//   input     — the user's content is the problem (moderation, unusable
//               photo, validation). Surfaced immediately, NEVER retried,
//               quota is consumed only when the provider actually worked.
//   budget    — our spend ceiling / provider balance. Not retryable now;
//               friendly capacity message, quota restored.
export type FailureClass = "transient" | "input" | "budget"

const INPUT_PATTERNS =
  /moderat|not allowed|content policy|violat|unsupported|invalid (image|photo|input)|too (large|small)|unreadable|nsfw|consent/i

const TRANSIENT_PATTERNS =
  /timeout|timed out|taking too long|ECONNRESET|ETIMEDOUT|fetch failed|network|502|503|504|429|rate limit|congest|overload|unavailable|internal server|queue/i

export function classifyFailure(err: unknown): FailureClass {
  if (isBudgetError(err)) return "budget"
  const msg = err instanceof Error ? err.message : String(err)
  const status = (err as { status?: number })?.status
  // Transient signals win over input signals: provider timeout copy often
  // contains words ("taking too long") that also look like validation.
  if (TRANSIENT_PATTERNS.test(msg)) return "transient"
  if (status && (status >= 500 || status === 429 || status === 408)) return "transient"
  if (status && status >= 400 && status < 500) return "input"
  if (INPUT_PATTERNS.test(msg)) return "input"
  // Unknown errors default to transient: retrying an unknown failure is
  // recoverable; refusing to retry a provider blip burns user trust.
  return "transient"
}

export const RETRY = {
  maxAttempts: 3,
  baseDelayMs: 2000,
} as const

export function retryDelayMs(attempt: number): number {
  return RETRY.baseDelayMs * Math.pow(2, attempt - 1)
}

// Retry transient failures with backoff; input/budget failures throw
// immediately. For bounded in-process work (TTS, single API calls) — long
// webhook-driven pipelines use their own stale-recovery instead.
export async function withRetries<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= RETRY.maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      const cls = classifyFailure(e)
      if (cls !== "transient" || attempt === RETRY.maxAttempts) throw e
      const delay = retryDelayMs(attempt)
      console.warn(`[retry] ${label} attempt ${attempt} failed (${(e as Error).message?.slice(0, 80)}) — retrying in ${delay}ms`)
      await new Promise((r) => setTimeout(r, delay))
    }
  }
  throw lastErr
}
