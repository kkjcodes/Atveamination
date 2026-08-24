import { describe, it, expect } from "vitest"
import { musicGain } from "@/lib/business/render/audio-mix"

// User-reported bug: music at 0 dB buried the voiceover (licensed tracks are
// mastered ~10-15 dB hotter than TTS speech). With VO present the music is a
// BED well under the voice; music-only ads keep it at full level.

describe("musicGain", () => {
  it("drops the bed well under the voice when a voiceover is present", () => {
    // -15 static + ~9 dB duck ≈ -24 under voice during speech (industry
    // envelope: -18 to -24; softened 3 dB on user request 2026-08-23).
    expect(musicGain("normal", true)).toBe(-15)
    expect(musicGain("quiet", true)).toBe(-21)
  })

  it("keeps music at full level for music-only ads", () => {
    expect(musicGain("normal", false)).toBe(0)
    expect(musicGain("quiet", false)).toBe(-6)
  })

  it("off is silent regardless of voiceover", () => {
    expect(musicGain("off", true)).toBeLessThan(-50)
    expect(musicGain("off", false)).toBeLessThan(-50)
  })
})
