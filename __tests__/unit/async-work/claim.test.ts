import { describe, it, expect, vi } from "vitest"
import { claimAsyncWork, STALE_WINDOWS } from "@/lib/async-work/claim"

describe("claimAsyncWork", () => {
  it("rejects if a fresh in-flight attempt exists", async () => {
    const claim = vi.fn().mockResolvedValue(1)
    const result = await claimAsyncWork({
      currentStatus: "processing",
      currentStartedAt: new Date(Date.now() - 60_000), // 1 min ago (fresh)
      activeStatus: "processing",
      staleAfterMs: 10 * 60_000, // 10 min stale window
      claim,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("fresh_in_flight")
    expect(claim).not.toHaveBeenCalled()
  })

  it("claims a stale processing row and reports wasStale=true", async () => {
    const claim = vi.fn().mockResolvedValue(1)
    const result = await claimAsyncWork({
      currentStatus: "processing",
      currentStartedAt: new Date(Date.now() - 20 * 60_000), // 20 min ago (stale)
      activeStatus: "processing",
      staleAfterMs: 10 * 60_000,
      claim,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.wasStale).toBe(true)
    expect(claim).toHaveBeenCalledOnce()
  })

  it("claims a null/never-run row (wasStale=false)", async () => {
    const claim = vi.fn().mockResolvedValue(1)
    const result = await claimAsyncWork({
      currentStatus: null,
      currentStartedAt: null,
      activeStatus: "processing",
      staleAfterMs: 10 * 60_000,
      claim,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.wasStale).toBe(false)
    expect(claim).toHaveBeenCalledOnce()
  })

  it("claims a previously-failed row", async () => {
    const claim = vi.fn().mockResolvedValue(1)
    const result = await claimAsyncWork({
      currentStatus: "failed",
      currentStartedAt: new Date(Date.now() - 60_000),
      activeStatus: "processing",
      staleAfterMs: 10 * 60_000,
      claim,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.wasStale).toBe(false)
  })

  it("claims a previously-succeeded row (retry-after-success)", async () => {
    const claim = vi.fn().mockResolvedValue(1)
    const result = await claimAsyncWork({
      currentStatus: "succeeded",
      currentStartedAt: null,
      activeStatus: "processing",
      staleAfterMs: 10 * 60_000,
      claim,
    })
    expect(result.ok).toBe(true)
  })

  it("returns fresh_in_flight if the claim callback finds zero rows (race lost)", async () => {
    const claim = vi.fn().mockResolvedValue(0) // simulated concurrent update took the lock first
    const result = await claimAsyncWork({
      currentStatus: null,
      currentStartedAt: null,
      activeStatus: "processing",
      staleAfterMs: 10 * 60_000,
      claim,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe("fresh_in_flight")
  })

  it("treats a processing row with null startedAt as reclaimable (pre-migration data)", async () => {
    const claim = vi.fn().mockResolvedValue(1)
    const result = await claimAsyncWork({
      currentStatus: "processing",
      currentStartedAt: null, // pre-migration row: column existed as processing but no timestamp
      activeStatus: "processing",
      staleAfterMs: 10 * 60_000,
      claim,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.wasStale).toBe(true)
  })
})

describe("STALE_WINDOWS", () => {
  it("all values are positive numbers", () => {
    for (const [key, val] of Object.entries(STALE_WINDOWS)) {
      expect(val).toBeGreaterThan(0)
      expect(typeof val).toBe("number")
      // Sanity: no stale window shorter than 30s or longer than an hour.
      expect(val).toBeGreaterThanOrEqual(30_000)
      expect(val).toBeLessThanOrEqual(60 * 60_000)
      expect(key).toBeDefined()
    }
  })
})
