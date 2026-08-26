import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db/client", () => ({ prisma: {} }))

const { classifyFailure, withRetries, retryDelayMs } = await import("@/lib/async-work/retry-policy")
const { BudgetExceededError } = await import("@/lib/budget/guard")

describe("classifyFailure", () => {
  it("budget errors classify as budget", () => {
    expect(classifyFailure(new BudgetExceededError("ceiling"))).toBe("budget")
  })
  it("moderation and validation are input failures", () => {
    expect(classifyFailure(new Error("Scene description not allowed: content policy"))).toBe("input")
    expect(classifyFailure(new Error("Image too large to process"))).toBe("input")
    expect(classifyFailure(Object.assign(new Error("Unprocessable"), { status: 422 }))).toBe("input")
  })
  it("timeouts, 5xx, and rate limits are transient", () => {
    expect(classifyFailure(new Error("The voice service is taking too long right now (waited 150s) timeout"))).toBe("transient")
    expect(classifyFailure(Object.assign(new Error("boom"), { status: 503 }))).toBe("transient")
    expect(classifyFailure(Object.assign(new Error("slow down"), { status: 429 }))).toBe("transient")
  })
  it("unknown errors default to transient", () => {
    expect(classifyFailure(new Error("mystery"))).toBe("transient")
  })
})

describe("withRetries", () => {
  it("retries transient failures then succeeds", async () => {
    vi.useFakeTimers()
    let n = 0
    const p = withRetries("test", async () => {
      n++
      if (n < 3) throw new Error("503 unavailable")
      return "ok"
    })
    await vi.runAllTimersAsync()
    expect(await p).toBe("ok")
    expect(n).toBe(3)
    vi.useRealTimers()
  })

  it("never retries input failures", async () => {
    let n = 0
    await expect(withRetries("test", async () => {
      n++
      throw new Error("content policy violation")
    })).rejects.toThrow(/policy/)
    expect(n).toBe(1)
  })

  it("backoff doubles per attempt", () => {
    expect(retryDelayMs(1)).toBe(2000)
    expect(retryDelayMs(2)).toBe(4000)
    expect(retryDelayMs(3)).toBe(8000)
  })
})
