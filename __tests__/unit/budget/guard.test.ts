import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAggregate = vi.fn()
const mockCreate = vi.fn()
vi.mock("@/lib/db/client", () => ({
  prisma: {
    spendLedger: {
      aggregate: (...a: unknown[]) => mockAggregate(...a),
      create: (...a: unknown[]) => mockCreate(...a),
    },
  },
}))

const guard = await import("@/lib/budget/guard")
const { estimateCost, DEFAULT_COST } = await import("@/lib/budget/costs")

function setSpend(todayUsd: number, monthUsd: number) {
  // spendSummary calls aggregate twice (day, month) via Promise.all — the
  // first call gets the day filter, the second the month filter.
  mockAggregate
    .mockResolvedValueOnce({ _sum: { estimatedCostUsd: todayUsd } })
    .mockResolvedValueOnce({ _sum: { estimatedCostUsd: monthUsd } })
}

beforeEach(() => {
  vi.clearAllMocks()
  guard._resetBreakerForTests()
  mockCreate.mockResolvedValue({})
})

describe("estimateCost", () => {
  it("looks up known operations and strips replicate version suffixes", () => {
    expect(estimateCost("fal", "fal-ai/wan-i2v")).toBe(0.5)
    expect(estimateCost("replicate", "lucataco/xtts-v2:684bc3855b")).toBe(0.05)
  })
  it("unknown operations get the default, never zero", () => {
    expect(estimateCost("fal", "fal-ai/some-new-model")).toBe(DEFAULT_COST)
  })
})

describe("spendSummary levels", () => {
  it("ok under soft threshold", async () => {
    setSpend(10, 100)
    expect((await guard.spendSummary()).level).toBe("ok")
  })
  it("soft at 70% of daily", async () => {
    setSpend(guard.DAILY_BUDGET_USD * 0.7, 100)
    expect((await guard.spendSummary()).level).toBe("soft")
  })
  it("hard at daily ceiling", async () => {
    setSpend(guard.DAILY_BUDGET_USD, 100)
    expect((await guard.spendSummary()).level).toBe("hard")
  })
  it("hard at monthly ceiling even when the day is quiet", async () => {
    setSpend(1, guard.MONTHLY_BUDGET_USD)
    expect((await guard.spendSummary()).level).toBe("hard")
  })
})

describe("gateAndRecord", () => {
  it("allows and writes a ledger row under budget", async () => {
    setSpend(1, 10)
    await guard.gateAndRecord("fal", "fal-ai/kokoro", { userId: "u1" })
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const arg = mockCreate.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(arg.data.provider).toBe("fal")
    expect(arg.data.estimatedCostUsd).toBe(0.005)
    expect(arg.data.userId).toBe("u1")
  })

  it("throws a friendly BudgetExceededError at the hard stop, no ledger row", async () => {
    setSpend(guard.DAILY_BUDGET_USD, 10)
    await expect(guard.gateAndRecord("fal", "fal-ai/wan-i2v")).rejects.toThrow(/capacity/)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("ledger write failure never blocks the call", async () => {
    setSpend(1, 10)
    mockCreate.mockRejectedValueOnce(new Error("db down"))
    await expect(guard.gateAndRecord("fal", "fal-ai/kokoro")).resolves.toBeUndefined()
  })
})

describe("circuit breaker", () => {
  it("trips on provider balance-exhaustion messages and short-circuits", async () => {
    guard.tripBreakerIfBalanceError(new Error("User is locked. Reason: Exhausted balance."))
    expect(guard.breakerEngaged()).toBe(true)
    await expect(guard.gateAndRecord("fal", "fal-ai/kokoro")).rejects.toThrow(/capacity/)
    // No DB reads or writes while the breaker is engaged.
    expect(mockAggregate).not.toHaveBeenCalled()
  })

  it("trips on HTTP 402", () => {
    const err = Object.assign(new Error("Payment Required"), { status: 402 })
    guard.tripBreakerIfBalanceError(err)
    expect(guard.breakerEngaged()).toBe(true)
  })

  it("does not trip on ordinary provider errors", () => {
    guard.tripBreakerIfBalanceError(new Error("model timed out"))
    expect(guard.breakerEngaged()).toBe(false)
  })

  it("isBudgetError identifies guard errors", async () => {
    setSpend(guard.DAILY_BUDGET_USD, 0)
    try {
      await guard.gateAndRecord("fal", "fal-ai/kokoro")
      expect.unreachable()
    } catch (e) {
      expect(guard.isBudgetError(e)).toBe(true)
    }
    expect(guard.isBudgetError(new Error("other"))).toBe(false)
  })
})
