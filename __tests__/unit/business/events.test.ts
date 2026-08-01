import { describe, it, expect, vi, beforeEach } from "vitest"

const mockEventCreate = vi.fn()
const mockEventCount = vi.fn()
const mockUserGroupBy = vi.fn()
const mockAdCount = vi.fn()
const mockVersionGroupBy = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    event: { create: mockEventCreate, count: mockEventCount },
    user: { groupBy: mockUserGroupBy },
    ad: { count: mockAdCount },
    adVersion: { groupBy: mockVersionGroupBy },
  },
}))

const {
  emit,
  countSignupsBySegment,
  countAdsAndRenders,
  medianIterationsPerAd,
  galleryOptInRate,
} = await import("@/lib/events")

beforeEach(() => {
  vi.clearAllMocks()
})

describe("emit", () => {
  it("writes an Event row with name, userId, props", async () => {
    mockEventCreate.mockResolvedValue({})
    await emit("business_created", { businessId: "b1" }, "u1")
    expect(mockEventCreate).toHaveBeenCalledWith({
      data: { name: "business_created", userId: "u1", props: { businessId: "b1" } },
    })
  })

  it("defaults userId to null for anonymous events", async () => {
    mockEventCreate.mockResolvedValue({})
    await emit("flow_entered", { door: "business" })
    expect(mockEventCreate).toHaveBeenCalledWith({
      data: { name: "flow_entered", userId: null, props: { door: "business" } },
    })
  })

  it("never throws even when DB rejects (fire-and-forget)", async () => {
    mockEventCreate.mockRejectedValue(new Error("DB down"))
    await expect(emit("signup", {})).resolves.toBeUndefined()
  })

  it("defaults props to empty object when omitted", async () => {
    mockEventCreate.mockResolvedValue({})
    await emit("signup")
    const call = mockEventCreate.mock.calls[0][0]
    expect(call.data.props).toEqual({})
  })
})

describe("countSignupsBySegment", () => {
  it("groups by segment and returns a plain object", async () => {
    mockUserGroupBy.mockResolvedValue([
      { segment: "family", _count: { id: 12 } },
      { segment: "business", _count: { id: 5 } },
      { segment: "both", _count: { id: 1 } },
    ])
    const out = await countSignupsBySegment()
    expect(out).toEqual({ family: 12, business: 5, both: 1 })
  })

  it("labels null segment as 'unset'", async () => {
    mockUserGroupBy.mockResolvedValue([{ segment: null, _count: { id: 3 } }])
    const out = await countSignupsBySegment()
    expect(out).toEqual({ unset: 3 })
  })
})

describe("countAdsAndRenders", () => {
  it("returns Ad count + render_completed event count", async () => {
    mockAdCount.mockResolvedValue(42)
    mockEventCount.mockResolvedValue(120)
    const out = await countAdsAndRenders()
    expect(out).toEqual({ ads: 42, renders: 120 })
    const call = mockEventCount.mock.calls[0][0]
    expect(call.where.name).toBe("render_completed")
  })
})

describe("medianIterationsPerAd", () => {
  it("returns 0 when no ads exist", async () => {
    mockVersionGroupBy.mockResolvedValue([])
    expect(await medianIterationsPerAd()).toBe(0)
  })

  it("computes median for odd-count list", async () => {
    // Iterations = versionCount - 1
    // ads: 1v, 3v, 4v → [0, 2, 3] → median 2
    mockVersionGroupBy.mockResolvedValue([
      { adId: "a1", _count: { id: 1 } },
      { adId: "a2", _count: { id: 3 } },
      { adId: "a3", _count: { id: 4 } },
    ])
    expect(await medianIterationsPerAd()).toBe(2)
  })

  it("computes median for even-count list (average of middle two)", async () => {
    // [0, 1, 3, 5] → (1+3)/2 = 2
    mockVersionGroupBy.mockResolvedValue([
      { adId: "a1", _count: { id: 1 } },
      { adId: "a2", _count: { id: 2 } },
      { adId: "a3", _count: { id: 4 } },
      { adId: "a4", _count: { id: 6 } },
    ])
    expect(await medianIterationsPerAd()).toBe(2)
  })

  it("floors negative iterations to 0 (never below v1)", async () => {
    mockVersionGroupBy.mockResolvedValue([
      { adId: "a1", _count: { id: 0 } },  // shouldn't happen but be defensive
    ])
    expect(await medianIterationsPerAd()).toBe(0)
  })
})

describe("galleryOptInRate", () => {
  it("returns 0 when no ready ads", async () => {
    mockAdCount.mockResolvedValueOnce(0)  // opted in
    mockAdCount.mockResolvedValueOnce(0)  // total
    expect(await galleryOptInRate()).toBe(0)
  })

  it("returns opted-in/total ratio", async () => {
    mockAdCount.mockResolvedValueOnce(7)   // opted in
    mockAdCount.mockResolvedValueOnce(10)  // total
    expect(await galleryOptInRate()).toBeCloseTo(0.7)
  })
})
