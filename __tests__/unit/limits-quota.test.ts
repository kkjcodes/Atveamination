import { describe, it, expect, vi, beforeEach } from "vitest"

const mockJobCount = vi.fn()
const mockJobUpdateMany = vi.fn()
const mockCharacterCount = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    job: { count: (...a: unknown[]) => mockJobCount(...a), updateMany: (...a: unknown[]) => mockJobUpdateMany(...a) },
    character: { count: (...a: unknown[]) => mockCharacterCount(...a) },
    event: { count: vi.fn().mockResolvedValue(0) },
  },
}))

const { checkSceneLimit, checkCharacterLimit, restoreSceneQuota, LIMITS } = await import("@/lib/limits")

beforeEach(() => {
  vi.clearAllMocks()
  mockJobUpdateMany.mockResolvedValue({ count: 1 })
})

describe("checkSceneLimit — daily + monthly ceilings", () => {
  it("allows when under both caps", async () => {
    mockJobCount.mockResolvedValueOnce(2).mockResolvedValueOnce(10) // today, month
    const r = await checkSceneLimit("u1", "FREE")
    expect(r.allowed).toBe(true)
    expect(r.limit).toBe(LIMITS.scenesPerDay)
  })

  it("blocks on the daily cap with a midnight reset", async () => {
    mockJobCount.mockResolvedValueOnce(LIMITS.scenesPerDay).mockResolvedValueOnce(15)
    const r = await checkSceneLimit("u1", "FREE")
    expect(r.allowed).toBe(false)
    expect((r.resetsAt as Date).getUTCHours()).toBe(0)
  })

  it("blocks on the monthly ceiling even when today is quiet — resets next month", async () => {
    mockJobCount.mockResolvedValueOnce(1).mockResolvedValueOnce(LIMITS.scenesPerMonth)
    const r = await checkSceneLimit("u1", "FREE")
    expect(r.allowed).toBe(false)
    expect(r.limit).toBe(LIMITS.scenesPerMonth)
    expect((r.resetsAt as Date).getUTCDate()).toBe(1)
  })

  it("excludes provider_failed jobs from the count", async () => {
    mockJobCount.mockResolvedValue(0)
    await checkSceneLimit("u1", "FREE")
    for (const call of mockJobCount.mock.calls) {
      const where = (call[0] as { where: { status?: unknown } }).where
      expect(where.status).toEqual({ not: "provider_failed" })
    }
  })
})

describe("checkCharacterLimit", () => {
  it("allows under 3/month, blocks at 3", async () => {
    mockCharacterCount.mockResolvedValueOnce(2)
    expect((await checkCharacterLimit("u1", "FREE")).allowed).toBe(true)
    mockCharacterCount.mockResolvedValueOnce(LIMITS.charactersPerMonth)
    expect((await checkCharacterLimit("u1", "FREE")).allowed).toBe(false)
  })

  it("SUPER_USER bypasses", async () => {
    const r = await checkCharacterLimit("u1", "SUPER_USER")
    expect(r.allowed).toBe(true)
    expect(mockCharacterCount).not.toHaveBeenCalled()
  })
})

describe("restoreSceneQuota", () => {
  it("marks the scene's quota jobs provider_failed", async () => {
    await restoreSceneQuota("scene-1")
    expect(mockJobUpdateMany).toHaveBeenCalledWith({
      where: { entityId: "scene-1", type: "scene_generate", status: { not: "provider_failed" } },
      data: { status: "provider_failed" },
    })
  })

  it("swallows DB errors — restore must never break a webhook", async () => {
    mockJobUpdateMany.mockRejectedValueOnce(new Error("db down"))
    await expect(restoreSceneQuota("scene-1")).resolves.toBeUndefined()
  })
})
