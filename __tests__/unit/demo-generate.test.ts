import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRateLimit = vi.fn()
vi.mock("@/lib/rate-limit", () => ({ rateLimit: (...a: unknown[]) => mockRateLimit(...a) }))

const mockScreen = vi.fn()
vi.mock("@/lib/ai/likeness-screen", () => ({ screenPublicFigure: (...a: unknown[]) => mockScreen(...a) }))

const mockUpload = vi.fn()
vi.mock("@/lib/storage/client", () => ({ uploadBlob: (...a: unknown[]) => mockUpload(...a) }))

const mockRun = vi.fn()
vi.mock("@/lib/replicate/client", () => ({
  replicate: { run: (...a: unknown[]) => mockRun(...a) },
  MODELS: { fluxKontextPro: "black-forest-labs/flux-kontext-pro" },
  CARTOON_STYLE_PROMPTS: { pixar: "pixar prompt", anime: "anime prompt", comic: "c", watercolor: "w" },
}))

const mockSharpBuffer = vi.fn()
vi.mock("sharp", () => ({
  default: () => ({
    rotate: () => ({ resize: () => ({ jpeg: () => ({ toBuffer: mockSharpBuffer }) }) }),
  }),
}))

const { generateDemo, hashIp } = await import("@/lib/demo/generate")

const FILE = { buffer: Buffer.from("img"), mimeType: "image/jpeg" }

beforeEach(() => {
  vi.clearAllMocks()
  mockRateLimit.mockReturnValue({ allowed: true, retryAfterMs: 0 })
  mockSharpBuffer.mockResolvedValue(Buffer.from("normalized"))
  mockScreen.mockResolvedValue({ block: false })
  mockUpload.mockImplementation(async (path: string) => `https://blob.example.com/${path}`)
  mockRun.mockResolvedValue(["https://replicate.example.com/out.jpg"])
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(4) }))
})

describe("generateDemo", () => {
  it("succeeds: normalizes, screens, generates, stores both blobs", async () => {
    const r = await generateDemo(FILE, "1.2.3.4", "pixar")
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.sourceUrl).toContain(`demo/${r.demoId}/source.jpg`)
      expect(r.resultUrl).toContain(`demo/${r.demoId}/result.jpg`)
    }
    // The model gets the NORMALIZED image (EXIF baked), not raw bytes.
    const input = (mockRun.mock.calls[0][1] as { input: { input_image: string } }).input
    expect(input.input_image).toContain(Buffer.from("normalized").toString("base64"))
  })

  it("refuses the 11th request from one IP with friendly copy", async () => {
    mockRateLimit.mockReturnValueOnce({ allowed: false, retryAfterMs: 1000 })
    const r = await generateDemo(FILE, "1.2.3.4", "pixar")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.status).toBe(429)
      expect(r.error).toMatch(/Sign up free/)
    }
    expect(mockRun).not.toHaveBeenCalled()
  })

  it("global ceiling returns 503 without calling the model", async () => {
    mockRateLimit
      .mockReturnValueOnce({ allowed: true, retryAfterMs: 0 })   // per-IP
      .mockReturnValueOnce({ allowed: false, retryAfterMs: 1000 }) // global
    const r = await generateDemo(FILE, "1.2.3.4", "pixar")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(503)
    expect(mockRun).not.toHaveBeenCalled()
  })

  it("blocks public figures before spending anything", async () => {
    mockScreen.mockResolvedValueOnce({ block: true })
    const r = await generateDemo(FILE, "1.2.3.4", "pixar")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(422)
    expect(mockRun).not.toHaveBeenCalled()
    expect(mockUpload).not.toHaveBeenCalled()
  })

  it("unreadable images return 400, not a crash", async () => {
    mockSharpBuffer.mockRejectedValueOnce(new Error("corrupt"))
    const r = await generateDemo(FILE, "1.2.3.4", "pixar")
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.status).toBe(400)
  })

  it("hashIp never returns the raw IP", () => {
    const h = hashIp("203.0.113.7")
    expect(h).not.toContain("203")
    expect(h).toHaveLength(24)
  })
})
