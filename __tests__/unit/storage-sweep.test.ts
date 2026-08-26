import { describe, it, expect, vi, beforeEach } from "vitest"

const mockDelete = vi.fn().mockResolvedValue({})
const now = Date.now()
let blobs: Array<{ name: string; properties: { createdOn?: Date } }> = []

vi.mock("@azure/storage-blob", () => ({
  BlobServiceClient: {
    fromConnectionString: () => ({
      getContainerClient: () => ({
        listBlobsFlat: async function* () {
          for (const b of blobs) yield b
        },
        getBlockBlobClient: (name: string) => ({
          deleteIfExists: () => { mockDelete(name); return Promise.resolve({}) },
        }),
      }),
    }),
  },
}))

process.env.AZURE_STORAGE_CONNECTION_STRING = "UseDevelopmentStorage=true"
const { sweepPrefixOlderThan } = await import("@/lib/storage/client")

const DAY = 24 * 60 * 60 * 1000

beforeEach(() => {
  vi.clearAllMocks()
})

describe("sweepPrefixOlderThan (demo 24h retention)", () => {
  it("deletes blobs older than the window, keeps fresh ones", async () => {
    blobs = [
      { name: "demo/old/source.jpg", properties: { createdOn: new Date(now - 2 * DAY) } },
      { name: "demo/old/result.jpg", properties: { createdOn: new Date(now - 25 * 60 * 60 * 1000) } },
      { name: "demo/fresh/source.jpg", properties: { createdOn: new Date(now - 60 * 1000) } },
    ]
    const n = await sweepPrefixOlderThan("demo/", DAY)
    expect(n).toBe(2)
    expect(mockDelete).toHaveBeenCalledWith("demo/old/source.jpg")
    expect(mockDelete).toHaveBeenCalledWith("demo/old/result.jpg")
    expect(mockDelete).not.toHaveBeenCalledWith("demo/fresh/source.jpg")
  })

  it("skips blobs with unknown creation time rather than deleting blindly", async () => {
    blobs = [{ name: "demo/mystery/source.jpg", properties: {} }]
    const n = await sweepPrefixOlderThan("demo/", DAY)
    expect(n).toBe(0)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("never throws — a sweep failure must not break the demo response", async () => {
    blobs = null as unknown as typeof blobs // force iteration crash
    await expect(sweepPrefixOlderThan("demo/", DAY)).resolves.toBe(0)
  })
})
