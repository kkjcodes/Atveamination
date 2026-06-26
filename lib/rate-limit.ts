// Simple in-memory sliding window rate limiter.
// Not shared across Node.js processes — good enough to deter naive abuse
// without requiring a Redis dependency.

type Window = { count: number; resetAt: number }

const store = new Map<string, Window>()

export function rateLimit(key: string, limit: number, windowMs: number): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now()
  const existing = store.get(key)

  if (!existing || now > existing.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, retryAfterMs: 0 }
  }

  existing.count++
  if (existing.count > limit) {
    return { allowed: false, retryAfterMs: existing.resetAt - now }
  }
  return { allowed: true, retryAfterMs: 0 }
}
