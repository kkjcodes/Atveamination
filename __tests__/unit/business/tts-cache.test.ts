import { describe, it, expect, vi, beforeEach } from "vitest"

// Mocks (declared before dynamic import of the module under test)
const mockFindUnique = vi.fn()
const mockCreate = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    ttsCache: { findUnique: mockFindUnique, create: mockCreate },
  },
}))

const mockFalSubscribe = vi.fn()
vi.mock("@/lib/fal/client", () => ({
  fal: { subscribe: mockFalSubscribe },
  FAL_MODELS: { kokoro: "fal-ai/kokoro" },
}))

const mockUpload = vi.fn()
const mockMirror = vi.fn()
vi.mock("@/lib/storage/client", () => ({
  uploadBlob: mockUpload,
  mirrorUrlToBlob: mockMirror,
}))

// ffmpeg/ffprobe use static file lookups that break under vitest — stub the
// module surface enough for the code paths under test.
vi.mock("fluent-ffmpeg", () => {
  const stub = () => stub
  const setFn = () => {}
  const impl = Object.assign(stub, { setFfmpegPath: setFn, setFfprobePath: setFn, ffprobe: (_p: string, cb: (e: Error | null, m: object) => void) => cb(null, { format: { duration: 3.2 } }) })
  return { default: impl }
})
vi.mock("ffmpeg-static", () => ({ default: null }))

vi.mock("fs", async () => {
  const actual = await vi.importActual<typeof import("fs")>("fs")
  return { ...actual, promises: { ...actual.promises, writeFile: async () => {}, unlink: async () => {} } }
})

const mockReplicateRun = vi.fn()
vi.mock("@/lib/replicate/client", () => ({
  replicate: { run: (...a: unknown[]) => mockReplicateRun(...a) },
}))

const { synthesize, prepareTtsInput } = await import("@/lib/business/tts")

// Prevent the network fetch — synthesize calls fetch(audioUrl) to probe.
;(globalThis as unknown as { fetch: unknown }).fetch = vi.fn().mockResolvedValue({
  arrayBuffer: async () => new ArrayBuffer(0),
})

beforeEach(() => {
  vi.clearAllMocks()
  mockMirror.mockResolvedValue("https://blob.example.com/business/tts-cache/hash.wav")
})

describe("synthesize (TTS with cache)", () => {
  it("returns cached row when the content hash already exists — no fal call", async () => {
    mockFindUnique.mockResolvedValue({
      contentHash: "abc",
      audioUrl: "https://blob.example.com/cached.wav",
      durationSec: 4.2,
    })

    const result = await synthesize("warm_f", "Fresh bread, every morning at six.")

    expect(result.cached).toBe(true)
    expect(result.audioUrl).toBe("https://blob.example.com/cached.wav")
    expect(result.durationSec).toBe(4.2)
    expect(mockFalSubscribe).not.toHaveBeenCalled()
  })

  it("calls fal + mirrors + persists on cache miss", async () => {
    mockFindUnique.mockResolvedValue(null)
    mockFalSubscribe.mockResolvedValue({ data: { audio: { url: "https://fal.ai/out.wav" } } })
    mockCreate.mockResolvedValue({})

    const result = await synthesize("energetic_f", "Come taste the difference.")

    expect(result.cached).toBe(false)
    expect(mockFalSubscribe).toHaveBeenCalledTimes(1)
    expect(mockMirror).toHaveBeenCalledWith("https://fal.ai/out.wav", expect.stringMatching(/^business\/tts-cache\/[a-f0-9]{32}\.wav$/))
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })

  it("maps warm_f → af_heart when calling fal", async () => {
    mockFindUnique.mockResolvedValue(null)
    mockFalSubscribe.mockResolvedValue({ data: { audio: { url: "https://fal.ai/out.wav" } } })
    mockCreate.mockResolvedValue({})

    await synthesize("warm_f", "hello")

    // We keep using the bare fal-ai/kokoro endpoint (aliased server-side, and
    // ~5-10× faster than the language-specific endpoints in practice).
    expect(mockFalSubscribe).toHaveBeenCalledWith(
      "fal-ai/kokoro",
      expect.objectContaining({ input: expect.objectContaining({ voice: "af_heart" }) }),
    )
  })

  it("applies pronunciation_hint via LHS -> RHS substitution before hashing", async () => {
    mockFindUnique.mockResolvedValue(null)
    mockFalSubscribe.mockResolvedValue({ data: { audio: { url: "https://fal.ai/out.wav" } } })
    mockCreate.mockResolvedValue({})

    await synthesize("warm_f", "Welcome to Nguyen's Bakery", "Nguyen's -> Win's")

    // The TTS actually receives the respelled text, not the canonical one.
    // Field name is now `prompt` (per Kokoro SDK contract) not `text`.
    expect(mockFalSubscribe).toHaveBeenCalledWith(
      "fal-ai/kokoro",
      expect.objectContaining({ input: expect.objectContaining({ prompt: "Welcome to Win's Bakery" }) }),
    )
  })

  it("rejects unknown voice archetype", async () => {
    // Force an invalid Voice value at the type boundary to exercise the guard.
    await expect(synthesize("robot_x" as unknown as "warm_f", "hi")).rejects.toThrow(/Unknown voice/)
  })

  it("falls back to the secondary provider when the primary fails (P5)", async () => {
    mockFindUnique.mockResolvedValue(null)
    mockFalSubscribe.mockResolvedValue({ data: { something_else: true } })
    mockReplicateRun.mockResolvedValue(["https://replicate.example.com/fallback.wav"])
    mockCreate.mockResolvedValue({})

    const result = await synthesize("warm_f", "hi")
    expect(result.cached).toBe(false)
    // warm_f maps to af_heart, which the fallback model lacks → af_bella.
    const input = (mockReplicateRun.mock.calls[0][1] as { input: { voice: string } }).input
    expect(input.voice).toBe("af_bella")
  })

  it("throws when BOTH providers fail", async () => {
    mockFindUnique.mockResolvedValue(null)
    mockFalSubscribe.mockResolvedValue({ data: { something_else: true } })
    mockReplicateRun.mockRejectedValue(new Error("fallback down"))

    await expect(synthesize("warm_f", "hi")).rejects.toThrow()
  })
})

describe("prepareTtsInput (pronunciation lexicon gating)", () => {
  it("applies phoneme markup for English voices", () => {
    expect(prepareTtsInput("af_heart", "This Rakhi, celebrate."))
      .toBe("This [Rakhi](/ɹˈɑki/), celebrate.")
  })

  it("skips the lexicon for Hindi voices — that endpoint reads markup literally", () => {
    expect(prepareTtsInput("hf_alpha", "This Rakhi, celebrate."))
      .toBe("This Rakhi, celebrate.")
  })

  it("applies pronunciation_hint before the lexicon", () => {
    expect(prepareTtsInput("af_heart", "Rakhi at Nguyen's", "Nguyen's -> Win's"))
      .toBe("[Rakhi](/ɹˈɑki/) at Win's")
  })
})
