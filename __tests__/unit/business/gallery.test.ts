import { describe, it, expect, vi, beforeEach } from "vitest"

const mockAdFindMany = vi.fn()
const mockAdFindFirst = vi.fn()
const mockVersionFindUnique = vi.fn()
const mockAssetFindUnique = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    ad: { findMany: mockAdFindMany, findFirst: mockAdFindFirst },
    adVersion: { findUnique: mockVersionFindUnique },
    asset: { findUnique: mockAssetFindUnique },
  },
}))

const { listGalleryAds, getGalleryAd } = await import("@/lib/business/gallery")

const AD = {
  id: "ad-1",
  templateFamily: "clean_modern",
  aspectRatio: "9:16",
  currentVersion: 3,
  createdAt: new Date("2026-07-01T10:00:00Z"),
  business: { name: "Rosie's Bakery" },
}

beforeEach(() => {
  vi.clearAllMocks()
  mockVersionFindUnique.mockResolvedValue({ renderAssetId: "asset-99" })
  mockAssetFindUnique.mockResolvedValue({ url: "https://blob.example.com/render.mp4" })
})

describe("listGalleryAds", () => {
  it("filters to galleryOptIn=true AND status=ready — private ads never leak", async () => {
    mockAdFindMany.mockResolvedValue([AD])
    await listGalleryAds()
    const call = mockAdFindMany.mock.calls[0][0]
    expect(call.where.galleryOptIn).toBe(true)
    expect(call.where.status).toBe("ready")
  })

  it("orders newest first (updatedAt desc) so gallery shows recency", async () => {
    mockAdFindMany.mockResolvedValue([AD])
    await listGalleryAds()
    const call = mockAdFindMany.mock.calls[0][0]
    expect(call.orderBy).toEqual({ updatedAt: "desc" })
  })

  it("applies templateFamily filter when provided", async () => {
    mockAdFindMany.mockResolvedValue([AD])
    await listGalleryAds({ templateFamily: "scrapbook" })
    const call = mockAdFindMany.mock.calls[0][0]
    expect(call.where.templateFamily).toBe("scrapbook")
  })

  it("caps limit at 50 (DDoS guard)", async () => {
    mockAdFindMany.mockResolvedValue([])
    await listGalleryAds({ limit: 500 })
    const call = mockAdFindMany.mock.calls[0][0]
    expect(call.take).toBeLessThanOrEqual(50)
  })

  it("clamps limit below 1 to 1", async () => {
    mockAdFindMany.mockResolvedValue([])
    await listGalleryAds({ limit: -1 })
    const call = mockAdFindMany.mock.calls[0][0]
    expect(call.take).toBeGreaterThanOrEqual(1)
  })

  it("skips ads whose currentVersion has no rendered asset (corrupt state)", async () => {
    mockAdFindMany.mockResolvedValue([AD])
    mockVersionFindUnique.mockResolvedValue({ renderAssetId: null })
    const cards = await listGalleryAds()
    expect(cards).toEqual([])
  })

  it("skips ads whose renderAsset row was deleted", async () => {
    mockAdFindMany.mockResolvedValue([AD])
    mockAssetFindUnique.mockResolvedValue(null)
    const cards = await listGalleryAds()
    expect(cards).toEqual([])
  })

  it("returns a public shape — never includes userId or blob path", async () => {
    mockAdFindMany.mockResolvedValue([AD])
    const [card] = await listGalleryAds()
    expect(card).toEqual({
      id: "ad-1",
      templateFamily: "clean_modern",
      aspectRatio: "9:16",
      businessName: "Rosie's Bakery",
      finalVideoUrl: "https://blob.example.com/render.mp4",
      createdAt: "2026-07-01T10:00:00.000Z",
    })
    // Explicit guard: no user_id/userId key leak
    expect(Object.keys(card).find((k) => k.toLowerCase().includes("user"))).toBeUndefined()
  })
})

describe("getGalleryAd", () => {
  it("returns null when ad is not opted-in", async () => {
    mockAdFindFirst.mockResolvedValue(null)
    const result = await getGalleryAd("ad-x")
    expect(result).toBeNull()
  })

  it("returns null when opted-in but no rendered asset yet", async () => {
    mockAdFindFirst.mockResolvedValue(AD)
    mockVersionFindUnique.mockResolvedValue({ renderAssetId: null })
    expect(await getGalleryAd("ad-1")).toBeNull()
  })

  it("returns public card when everything is in place", async () => {
    mockAdFindFirst.mockResolvedValue(AD)
    const card = await getGalleryAd("ad-1")
    expect(card).not.toBeNull()
    expect(card?.businessName).toBe("Rosie's Bakery")
    expect(card?.finalVideoUrl).toBe("https://blob.example.com/render.mp4")
  })

  it("passes galleryOptIn+status filter to findFirst — private ad never leaks", async () => {
    mockAdFindFirst.mockResolvedValue(null)
    await getGalleryAd("ad-1")
    const call = mockAdFindFirst.mock.calls[0][0]
    expect(call.where.galleryOptIn).toBe(true)
    expect(call.where.status).toBe("ready")
    expect(call.where.id).toBe("ad-1")
  })
})
