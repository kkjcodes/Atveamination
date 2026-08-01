import { describe, it, expect, vi, beforeEach } from "vitest"

// Route-level tests for /api/scrapbook/pages/[id]/generate. Cover the
// scenarios called out in the code review: fresh 409, stale reclaim,
// dynamic handoff timestamp preservation. Prisma is mocked at the module
// boundary via vi.mock (below) — no real DB.

// ── Mock module boundary ─────────────────────────────────────────────
const findFirstMock = vi.fn()
const updateManyMock = vi.fn()
const updateMock = vi.fn()
const jobFindFirstMock = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scrapbookPage: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      updateMany: (...args: unknown[]) => updateManyMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
    job: {
      findFirst: (...args: unknown[]) => jobFindFirstMock(...args),
    },
  },
}))

vi.mock("@/lib/auth/config", () => ({ authOptions: {} }))
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({
    user: { id: "user-1", role: "FREE" },
  }),
}))
vi.mock("@/lib/limits", () => ({
  checkScrapbookLimit: vi.fn().mockResolvedValue({ allowed: true }),
  logUsage: vi.fn().mockResolvedValue(undefined),
  killSwitchEngaged: vi.fn().mockResolvedValue({ engaged: false }),
}))
vi.mock("@/lib/events", () => ({ emit: vi.fn() }))
const pipelineMock = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/scrapbook/pipeline", () => ({
  runPagePipeline: (...args: unknown[]) => pipelineMock(...args),
}))

// Import AFTER the mocks so the route sees them.
import { POST } from "@/app/api/scrapbook/pages/[id]/generate/route"

function makeParams(id: string): Promise<{ id: string }> {
  return Promise.resolve({ id })
}

beforeEach(() => {
  vi.clearAllMocks()
  jobFindFirstMock.mockResolvedValue({ id: "job-existing" }) // already-charged path
  updateMock.mockResolvedValue({})
})

describe("POST /api/scrapbook/pages/[id]/generate", () => {
  it("returns 202 and claims a fresh page (never-run row)", async () => {
    findFirstMock.mockResolvedValue({
      id: "page-1",
      generationPhase: null,
      generationStartedAt: null,
      project: { id: "project-1", userId: "user-1" },
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("page-1") })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.status).toBe("processing")
    expect(updateManyMock).toHaveBeenCalledOnce()
    const call = updateManyMock.mock.calls[0][0]
    // Timestamp is set to now on claim
    expect(call.data.generationStartedAt).toBeInstanceOf(Date)
    expect(call.data.generationPhase).toBe("vision")
    // Failure metadata cleared on new claim
    expect(call.data.generationFailureCode).toBeNull()
  })

  it("returns 409 when a fresh processing attempt is in-flight", async () => {
    findFirstMock.mockResolvedValue({
      id: "page-1",
      generationPhase: "motion",
      generationStartedAt: new Date(Date.now() - 60_000), // 1 min ago — fresh
      project: { id: "project-1", userId: "user-1" },
    })
    // claim() shouldn't even be called, but if it is, simulate the race loss
    updateManyMock.mockResolvedValue({ count: 0 })

    const res = await POST({} as never, { params: makeParams("page-1") })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error).toMatch(/already in progress/i)
  })

  it("reclaims a STALE processing row (>staleAfter, but claim.ok)", async () => {
    findFirstMock.mockResolvedValue({
      id: "page-1",
      generationPhase: "motion",
      generationStartedAt: new Date(Date.now() - 20 * 60_000), // 20 min ago — stale (window is 8 min)
      project: { id: "project-1", userId: "user-1" },
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("page-1") })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.reclaimedStale).toBe(true)
    expect(updateManyMock).toHaveBeenCalledOnce()
  })

  it("reclaims a previously-failed page", async () => {
    findFirstMock.mockResolvedValue({
      id: "page-1",
      generationPhase: "failed",
      generationStartedAt: new Date(Date.now() - 60_000),
      project: { id: "project-1", userId: "user-1" },
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("page-1") })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.status).toBe("processing")
  })

  it("does NOT clear generationStartedAt in the fire-and-forget success handler (dynamic-handoff safety)", async () => {
    // Setup: fresh claim, pipeline completes fast.
    findFirstMock.mockResolvedValue({
      id: "page-1",
      generationPhase: null,
      generationStartedAt: null,
      project: { id: "project-1", userId: "user-1" },
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("page-1") })
    expect(res.status).toBe(202)

    // Wait for the fireAndForget microtask to flush.
    await new Promise((r) => setTimeout(r, 20))

    // Route should not call prisma.scrapbookPage.update with startedAt=null
    // after pipeline succeeds — that clearing job belongs to runQcAndFinalize
    // (subtle terminal) or the fal webhook (dynamic terminal).
    const startedAtNullCalls = updateMock.mock.calls.filter((call) => {
      const data = call[0]?.data ?? {}
      return "generationStartedAt" in data && data.generationStartedAt === null
    })
    expect(startedAtNullCalls).toHaveLength(0)
  })

  it("returns 401 without auth", async () => {
    // Reload the mocked getServerSession to return null once.
    const nextAuth = await import("next-auth")
    ;(nextAuth.getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)

    const res = await POST({} as never, { params: makeParams("page-1") })
    expect(res.status).toBe(401)
  })

  it("returns 404 when page not found or belongs to another user", async () => {
    findFirstMock.mockResolvedValue(null)
    const res = await POST({} as never, { params: makeParams("does-not-exist") })
    expect(res.status).toBe(404)
  })
})
