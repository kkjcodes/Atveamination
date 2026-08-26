import { describe, it, expect } from "vitest"
import { snapDurationsToBeat, contrastMotion, shouldSplitScene, SPLIT_THRESHOLD_SEC } from "@/lib/business/render/pacing"
import { captionFragment } from "@/lib/business/render/text-overlay"

describe("snapDurationsToBeat", () => {
  it("snaps durations UP to the next beat at 120bpm (0.5s beats)", () => {
    expect(snapDurationsToBeat([3.1, 4.0, 2.6], 120)).toEqual([3.5, 4, 3])
  })
  it("never shrinks a duration (narration must not be cut)", () => {
    const input = [3.24, 5.87, 2.01]
    const out = snapDurationsToBeat(input, 97)
    out.forEach((d, i) => expect(d).toBeGreaterThanOrEqual(input[i] - 1e-6))
  })
  it("leaves durations untouched with no or absurd bpm", () => {
    expect(snapDurationsToBeat([3.1, 4.2], null)).toEqual([3.1, 4.2])
    expect(snapDurationsToBeat([3.1], 500)).toEqual([3.1])
    expect(snapDurationsToBeat([3.1], 10)).toEqual([3.1])
  })
})

describe("scene splitting", () => {
  it("splits long photo scenes, not end cards or presenter scenes", () => {
    expect(shouldSplitScene("hook", SPLIT_THRESHOLD_SEC, false)).toBe(true)
    expect(shouldSplitScene("benefit", 6.5, false)).toBe(true)
    expect(shouldSplitScene("hook", 4.9, false)).toBe(false)
    expect(shouldSplitScene("end_card", 8, false)).toBe(false)
    expect(shouldSplitScene("hook", 8, true)).toBe(false)
  })
  it("contrast motion always differs from the original", () => {
    for (const m of ["slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right", "hold"] as const) {
      expect(contrastMotion(m)).not.toBe(m)
    }
  })
})

describe("phrase-timed captions", () => {
  const LONG = "A stunning new rental just hit the market in the heart of Ridgeview and it will not last long"
  it("two-phrase captions get enable windows covering the scene", () => {
    const f = captionFragment(LONG, 1080, 1920, null, 0, null, 6)
    expect(f).toContain("enable='between(t,0,3.000)'")
    expect(f).toContain("enable='between(t,3.000,6.000)'")
  })
  it("short captions and unknown durations keep the static layout", () => {
    expect(captionFragment("hello", 1080, 1920, null, 0, null, 6)).not.toContain("enable=")
    expect(captionFragment(LONG, 1080, 1920, null)).not.toContain("enable=")
  })
})
