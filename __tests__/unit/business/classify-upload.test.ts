import { describe, it, expect, vi, beforeEach } from "vitest"

const mockCreate = vi.fn()
vi.mock("@/lib/ai/client", () => ({
  anthropic: { messages: { create: (...a: unknown[]) => mockCreate(...a) } },
  BRIEF_MODEL: "test-model",
}))

const { classifyUpload, CLASS_NOTES } = await import("@/lib/business/classify-upload")

const BUF = Buffer.from("img")

function reply(text: string) {
  mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text }] })
}

beforeEach(() => vi.clearAllMocks())

describe("classifyUpload", () => {
  it("parses a photo classification", async () => {
    reply('{"class": "photo", "text": null}')
    expect(await classifyUpload(BUF, "image/jpeg")).toEqual({ contentClass: "photo", extractedText: null })
  })

  it("parses a flyer with extracted text", async () => {
    reply('{"class": "flyer", "text": "Spring sale — 20% off bouquets through May 10"}')
    const r = await classifyUpload(BUF, "image/png")
    expect(r.contentClass).toBe("flyer")
    expect(r.extractedText).toContain("20% off")
  })

  it("ignores extracted text on non-flyer classes", async () => {
    reply('{"class": "logo", "text": "should be dropped"}')
    expect(await classifyUpload(BUF, "image/jpeg")).toEqual({ contentClass: "logo", extractedText: null })
  })

  it("tolerates prose around the JSON", async () => {
    reply('Here is my answer: {"class": "stock_watermarked", "text": null} — done.')
    expect((await classifyUpload(BUF, "image/jpeg")).contentClass).toBe("stock_watermarked")
  })

  it("fails open to photo on unknown class, bad JSON, or API error", async () => {
    reply('{"class": "meme", "text": null}')
    expect((await classifyUpload(BUF, "image/jpeg")).contentClass).toBe("photo")
    reply("not json at all")
    expect((await classifyUpload(BUF, "image/jpeg")).contentClass).toBe("photo")
    mockCreate.mockRejectedValueOnce(new Error("api down"))
    expect((await classifyUpload(BUF, "image/jpeg")).contentClass).toBe("photo")
  })

  it("has a user-facing note for every non-photo class", () => {
    expect(CLASS_NOTES.flyer).toBeTruthy()
    expect(CLASS_NOTES.logo).toBeTruthy()
    expect(CLASS_NOTES.stock_watermarked).toBeTruthy()
    expect(CLASS_NOTES.photo).toBeNull()
  })
})
