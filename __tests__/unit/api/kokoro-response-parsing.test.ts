import { describe, it, expect } from "vitest"

// Mirrors the response-shape parsing in:
//   - app/api/webhooks/replicate/route.ts
//   - app/api/scenes/[id]/route.ts
//
// fal-ai/kokoro returns { audio: { url } } — the original code only checked
// audio_url and audio_file.url, so URLs were never extracted and audio silently
// stayed null on every scene. This test locks down all three shapes.

function extractKokoroUrl(data: unknown): string | null {
  const d = data as { audio?: { url: string }; audio_url?: string; audio_file?: { url: string } }
  return d?.audio?.url ?? d?.audio_url ?? d?.audio_file?.url ?? null
}

describe("extractKokoroUrl", () => {
  it("reads from { audio: { url } } — the actual fal-ai/kokoro shape (June 2026)", () => {
    expect(extractKokoroUrl({ audio: { url: "https://fal/audio.wav" } })).toBe("https://fal/audio.wav")
  })

  it("falls back to top-level audio_url", () => {
    expect(extractKokoroUrl({ audio_url: "https://legacy/audio.wav" })).toBe("https://legacy/audio.wav")
  })

  it("falls back to audio_file.url", () => {
    expect(extractKokoroUrl({ audio_file: { url: "https://other/audio.wav" } })).toBe("https://other/audio.wav")
  })

  it("prefers audio.url when multiple shapes are present", () => {
    expect(
      extractKokoroUrl({
        audio: { url: "https://primary" },
        audio_url: "https://fallback",
        audio_file: { url: "https://other" },
      })
    ).toBe("https://primary")
  })

  it("returns null for empty or unrecognized shapes — guards against silent failure", () => {
    expect(extractKokoroUrl({})).toBeNull()
    expect(extractKokoroUrl(null)).toBeNull()
    expect(extractKokoroUrl({ audio: {} })).toBeNull()
    expect(extractKokoroUrl({ unrelated: "value" })).toBeNull()
  })
})
