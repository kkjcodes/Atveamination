import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockEventCount = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    event: { count: mockEventCount },
    job: { count: vi.fn().mockResolvedValue(0), create: vi.fn().mockResolvedValue({}) },
  },
}))

const {
  checkBusinessRenderLimit,
  checkFamilyRenderLimit,
  killSwitchEngaged,
  LIMITS,
} = await import("@/lib/limits")

beforeEach(() => {
  vi.clearAllMocks()
  delete process.env.KILL_SWITCH
})

afterEach(() => {
  delete process.env.KILL_SWITCH
})

describe("checkBusinessRenderLimit", () => {
  it("allows when under 15/mo cap", async () => {
    mockEventCount.mockResolvedValue(3)
    const r = await checkBusinessRenderLimit("u1", "FREE")
    expect(r.allowed).toBe(true)
    expect(r.used).toBe(3)
    expect(r.limit).toBe(LIMITS.businessRendersPerMonth)
  })

  it("blocks at exactly 15", async () => {
    mockEventCount.mockResolvedValue(15)
    const r = await checkBusinessRenderLimit("u1", "FREE")
    expect(r.allowed).toBe(false)
  })

  it("returns Infinity limit for SUPER_USER (bypass)", async () => {
    mockEventCount.mockResolvedValue(999)  // shouldn't even be queried
    const r = await checkBusinessRenderLimit("u1", "SUPER_USER")
    expect(r.allowed).toBe(true)
    expect(r.limit).toBe(Infinity)
    expect(mockEventCount).not.toHaveBeenCalled()
  })

  it("resets on the first of next month", async () => {
    mockEventCount.mockResolvedValue(5)
    const r = await checkBusinessRenderLimit("u1", "FREE")
    expect(r.resetsAt).toBeInstanceOf(Date)
    const d = r.resetsAt as Date
    expect(d.getUTCDate()).toBe(1)
    expect(d.getUTCHours()).toBe(0)
  })

  it("filters events to render_completed only (not render_started etc.)", async () => {
    mockEventCount.mockResolvedValue(0)
    await checkBusinessRenderLimit("u1", "FREE")
    const call = mockEventCount.mock.calls[0][0]
    expect(call.where.name).toBe("render_completed")
    expect(call.where.userId).toBe("u1")
  })

  it("filters by props.segment === 'business' via JSON path (family renders don't count)", async () => {
    mockEventCount.mockResolvedValue(0)
    await checkBusinessRenderLimit("u1", "FREE")
    const call = mockEventCount.mock.calls[0][0]
    expect(call.where.props).toEqual({ path: ["segment"], equals: "business" })
  })
})

describe("checkFamilyRenderLimit", () => {
  it("uses 3/mo cap and counts ad_downloaded events", async () => {
    mockEventCount.mockResolvedValue(1)
    const r = await checkFamilyRenderLimit("u1", "FREE")
    expect(r.limit).toBe(LIMITS.familyRendersPerMonth)
    expect(r.allowed).toBe(true)
    const call = mockEventCount.mock.calls[0][0]
    expect(call.where.name).toBe("ad_downloaded")
  })
})

describe("killSwitchEngaged", () => {
  it("returns engaged=true when KILL_SWITCH env is '1'", async () => {
    process.env.KILL_SWITCH = "1"
    const r = await killSwitchEngaged()
    expect(r.engaged).toBe(true)
    expect(r.reason).toContain("manual")
  })

  it("returns engaged=false when env is unset AND monthly calls under cap", async () => {
    mockEventCount.mockResolvedValue(100)
    const r = await killSwitchEngaged()
    expect(r.engaged).toBe(false)
    expect(r.reason).toBeNull()
  })

  it("auto-trips when monthly model calls exceed MAX_MONTHLY_MODEL_CALLS", async () => {
    mockEventCount.mockResolvedValue(LIMITS.maxMonthlyModelCalls + 1)
    const r = await killSwitchEngaged()
    expect(r.engaged).toBe(true)
    expect(r.reason).toContain("monthly model calls")
  })

  it("counts only model-calling events (not landing clicks or opt-ins)", async () => {
    mockEventCount.mockResolvedValue(0)
    await killSwitchEngaged()
    const call = mockEventCount.mock.calls[0][0]
    expect(call.where.name.in).toEqual(["adscript_generated", "tts_synthesized", "render_completed"])
  })

  it("env manual switch takes precedence over auto-trip check (no DB query)", async () => {
    process.env.KILL_SWITCH = "1"
    await killSwitchEngaged()
    expect(mockEventCount).not.toHaveBeenCalled()
  })
})
