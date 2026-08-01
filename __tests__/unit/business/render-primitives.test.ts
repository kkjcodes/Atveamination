import { describe, it, expect } from "vitest"
import { dimensionsFor } from "@/lib/business/render/dimensions"
import { buildMotionFilter } from "@/lib/business/render/motion"
import { sceneOffsets } from "@/lib/business/render/audio-mix"
import { escapeDrawtext, baseFontSize, overlayY, drawtextFragment } from "@/lib/business/render/text-overlay"

// Pure-logic tests — no ffmpeg binary required. Verifies the deterministic
// bits that everything else builds on. Golden ffmpeg-render tests belong in
// a separate manual/CI-gated suite.

describe("dimensionsFor", () => {
  it("returns 1080x1920 for 9:16", () => {
    expect(dimensionsFor("9:16")).toEqual({ width: 1080, height: 1920 })
  })
  it("returns 1080x1080 for 1:1", () => {
    expect(dimensionsFor("1:1")).toEqual({ width: 1080, height: 1080 })
  })
  it("returns 1920x1080 for 16:9", () => {
    expect(dimensionsFor("16:9")).toEqual({ width: 1920, height: 1080 })
  })
})

describe("buildMotionFilter", () => {
  it("hold produces a scale+crop chain (no motion)", () => {
    const f = buildMotionFilter("hold", 3, 1080, 1920)
    expect(f).toContain("scale=1080:1920")
    expect(f).toContain("crop=1080:1920")
    expect(f).not.toContain("zoompan")
  })

  it("slow_zoom_in produces a zoompan clamped to 1.08", () => {
    const f = buildMotionFilter("slow_zoom_in", 3, 1080, 1920)
    expect(f).toContain("zoompan")
    expect(f).toContain("1.08")
  })

  it("pan_left and pan_right differ in the x expression", () => {
    const fl = buildMotionFilter("pan_left", 3, 1080, 1920)
    const fr = buildMotionFilter("pan_right", 3, 1080, 1920)
    expect(fl).not.toEqual(fr)
  })

  it("uses even-numbered working dimensions (libx264 requirement)", () => {
    // 1081x1919 (odd inputs) → working dims should be 1080x1918.
    const f = buildMotionFilter("slow_zoom_in", 3, 1081, 1919)
    expect(f).toContain("s=1080x1918")
  })

  it("output scales to requested dims regardless of intermediate size", () => {
    const f = buildMotionFilter("slow_zoom_in", 3, 1920, 1080)
    expect(f).toMatch(/scale=1920:1080$/)
  })
})

describe("sceneOffsets", () => {
  it("shifts each offset by cumulative prior durations + lead-in", () => {
    const offsets = sceneOffsets([3, 4, 5])
    // Lead-in of 0.2s
    expect(offsets[0]).toBeCloseTo(0.2)
    expect(offsets[1]).toBeCloseTo(3.2)
    expect(offsets[2]).toBeCloseTo(7.2)
  })

  it("returns empty for empty input", () => {
    expect(sceneOffsets([])).toEqual([])
  })
})

describe("escapeDrawtext", () => {
  it("escapes colons and percents", () => {
    expect(escapeDrawtext("open 9:00 - 50% off")).toBe("open 9\\:00 - 50\\% off")
  })
  it("replaces straight apostrophe with curly", () => {
    expect(escapeDrawtext("Rosie's Bakery")).toContain("’")
  })
  it("flattens newlines to spaces", () => {
    expect(escapeDrawtext("line one\nline two")).toBe("line one line two")
  })
})

describe("overlayY / baseFontSize", () => {
  it("lower_third places text ~72% down the frame", () => {
    expect(overlayY("lower_third", 1000)).toBe("720")
  })
  it("upper_third places text ~18% down the frame", () => {
    expect(overlayY("upper_third", 1000)).toBe("180")
  })
  it("center uses ffmpeg expression, not a fixed number", () => {
    expect(overlayY("center", 1000)).toContain("(h-text_h)/2")
  })
  it("baseFontSize scales linearly with height (~6%)", () => {
    expect(baseFontSize(1000)).toBe(60)
    expect(baseFontSize(1920)).toBe(115)
  })
})

describe("drawtextFragment", () => {
  it("uses fontfile when provided, sans fallback otherwise", () => {
    const withFont = drawtextFragment("hi", "lower_third", 1080, 1920, "/path/font.ttf")
    expect(withFont).toContain("fontfile='/path/font.ttf'")
    const noFont = drawtextFragment("hi", "lower_third", 1080, 1920, null)
    expect(noFont).toContain("font='sans'")
  })
  it("includes a black-outline border for readability on photos", () => {
    const f = drawtextFragment("hi", "center", 1080, 1920, null)
    expect(f).toContain("borderw=2")
  })
})
