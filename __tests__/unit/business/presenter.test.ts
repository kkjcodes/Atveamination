import { describe, it, expect } from "vitest"
import {
  PRESENTER_ELIGIBLE_STYLES,
  isPresenterEligibleStyle,
  presenterLineHash,
  generatePresenterClip,
} from "@/lib/business/presenter"

describe("isPresenterEligibleStyle", () => {
  it("allows only bench-passed styles", () => {
    for (const s of PRESENTER_ELIGIBLE_STYLES) expect(isPresenterEligibleStyle(s)).toBe(true)
    // C0 bench 2026-08-06 failures: face detector can't find these faces.
    expect(isPresenterEligibleStyle("chibi")).toBe(false)  // extreme proportions
    expect(isPresenterEligibleStyle("ghibli")).toBe(false) // soft features
    // Kumar's review call: claymation over-smiles, cut from the picker.
    expect(isPresenterEligibleStyle("claymation")).toBe(false)
    expect(isPresenterEligibleStyle(null)).toBe(false)
    expect(isPresenterEligibleStyle("")).toBe(false)
  })
})

describe("presenterLineHash", () => {
  it("stable for same inputs, changes with line or character", () => {
    const a = presenterLineHash("char1", "Welcome to the show")
    expect(presenterLineHash("char1", "  Welcome to the show  ")).toBe(a) // trimmed
    expect(presenterLineHash("char1", "Different line")).not.toBe(a)
    expect(presenterLineHash("char2", "Welcome to the show")).not.toBe(a)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
  })
})

describe("generatePresenterClip cache", () => {
  it("returns the cached clip without any provider calls when the line hash matches", async () => {
    const lineHash = presenterLineHash("char1", "Same line")
    const out = await generatePresenterClip({
      adId: "ad1",
      characterId: "char1",
      styleImageUrl: "https://example.com/style.jpg",
      voText: "Same line",
      voAudioUrl: "https://example.com/audio.wav",
      replicateToken: "unused",
      cached: { clipUrl: "https://blob/clip.mp4", keyframeUrl: "https://blob/key.jpg", lineHash },
    })
    expect(out.clipUrl).toBe("https://blob/clip.mp4")
    expect(out.lineHash).toBe(lineHash)
  })
})
