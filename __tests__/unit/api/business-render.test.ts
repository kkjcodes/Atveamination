import { describe, it, expect, vi, beforeEach } from "vitest"

const adFindFirstMock = vi.fn()
const adUpdateManyMock = vi.fn()
const assetFindManyMock = vi.fn().mockResolvedValue([
  { id: "asset-1", url: "https://blob/photo1.jpg" },
])

vi.mock("@/lib/db/client", () => ({
  prisma: {
    ad: {
      findFirst: (...args: unknown[]) => adFindFirstMock(...args),
      updateMany: (...args: unknown[]) => adUpdateManyMock(...args),
      update: vi.fn().mockResolvedValue({}),
    },
    asset: {
      findMany: (...args: unknown[]) => assetFindManyMock(...args),
      create: vi.fn(),
    },
    adVersion: { updateMany: vi.fn() },
  },
}))
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }))
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user-1", role: "FREE" } }),
}))
vi.mock("@/lib/limits", () => ({
  checkBusinessRenderLimit: vi.fn().mockResolvedValue({ allowed: true }),
  killSwitchEngaged: vi.fn().mockResolvedValue({ engaged: false }),
}))
vi.mock("@/lib/events", () => ({ emit: vi.fn() }))
vi.mock("@/lib/business/render", () => ({
  renderAd: vi.fn().mockResolvedValue({ finalVideoUrl: "https://blob/render.mp4", durationSec: 30 }),
  downloadAssetsToLocal: vi.fn().mockResolvedValue(new Map([["asset-1", "/tmp/photo.jpg"]])),
}))
vi.mock("@/lib/paths", () => ({ publicPath: (p: string) => `/public/${p}` }))

import { POST } from "@/app/api/business/ads/[id]/render/route"

function makeParams(id: string) {
  return Promise.resolve({ id })
}

const baseAd = {
  id: "ad-1",
  templateFamily: "bold_promo",
  aspectRatio: "9:16",
  currentVersion: 1,
  status: "draft" as string,
  renderStartedAt: null as Date | null,
  adScript: {
    scenes: [
      { type: "photo_ken_burns", asset_id: "asset-1" },
    ],
  },
  business: { id: "biz-1", userId: "user-1", logoAssetId: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  assetFindManyMock.mockResolvedValue([{ id: "asset-1", url: "https://blob/photo1.jpg" }])
})

describe("POST /api/business/ads/[id]/render — async claim + stale recovery", () => {
  it("returns 202 for a fresh ad (draft → rendering)", async () => {
    adFindFirstMock.mockResolvedValue({ ...baseAd })
    adUpdateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("ad-1") })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.status).toBe("rendering")
    expect(body.reclaimedStale).toBe(false)
    const call = adUpdateManyMock.mock.calls[0][0]
    expect(call.data.status).toBe("rendering")
    expect(call.data.renderStartedAt).toBeInstanceOf(Date)
    expect(call.data.renderFailureCode).toBeNull()
  })

  it("returns 409 when a fresh render is in-flight", async () => {
    adFindFirstMock.mockResolvedValue({
      ...baseAd,
      status: "rendering",
      renderStartedAt: new Date(Date.now() - 60_000), // 1 min ago, fresh
    })
    adUpdateManyMock.mockResolvedValue({ count: 0 })
    const res = await POST({} as never, { params: makeParams("ad-1") })
    expect(res.status).toBe(409)
  })

  it("reclaims a stale rendering row (>5min)", async () => {
    adFindFirstMock.mockResolvedValue({
      ...baseAd,
      status: "rendering",
      renderStartedAt: new Date(Date.now() - 10 * 60_000), // 10 min ago, stale
    })
    adUpdateManyMock.mockResolvedValue({ count: 1 })
    const res = await POST({} as never, { params: makeParams("ad-1") })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.reclaimedStale).toBe(true)
  })

  it("reclaims a rendering row with null renderStartedAt (pre-migration)", async () => {
    adFindFirstMock.mockResolvedValue({
      ...baseAd,
      status: "rendering",
      renderStartedAt: null,
    })
    adUpdateManyMock.mockResolvedValue({ count: 1 })
    const res = await POST({} as never, { params: makeParams("ad-1") })
    expect(res.status).toBe(202)
  })

  it("returns 400 when ad has no script yet", async () => {
    adFindFirstMock.mockResolvedValue({ ...baseAd, adScript: null })
    const res = await POST({} as never, { params: makeParams("ad-1") })
    expect(res.status).toBe(400)
    expect(adUpdateManyMock).not.toHaveBeenCalled()
  })

  it("returns 400 when required asset is missing", async () => {
    adFindFirstMock.mockResolvedValue({ ...baseAd })
    assetFindManyMock.mockResolvedValueOnce([]) // no asset rows returned
    const res = await POST({} as never, { params: makeParams("ad-1") })
    expect(res.status).toBe(400)
  })

  it("returns 429 when render limit exceeded", async () => {
    adFindFirstMock.mockResolvedValue({ ...baseAd })
    const limits = await import("@/lib/limits")
    ;(limits.checkBusinessRenderLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false, used: 5, limit: 5, resetsAt: new Date().toISOString(),
    })
    const res = await POST({} as never, { params: makeParams("ad-1") })
    expect(res.status).toBe(429)
  })

  it("returns 401 without auth", async () => {
    const nextAuth = await import("next-auth")
    ;(nextAuth.getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const res = await POST({} as never, { params: makeParams("ad-1") })
    expect(res.status).toBe(401)
  })
})
