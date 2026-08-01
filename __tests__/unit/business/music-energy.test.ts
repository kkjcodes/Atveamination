import { describe, it, expect } from "vitest"
import { dbSeriesToLinearEnergy, findLoudestWindowStart } from "@/lib/business/music-energy"

describe("dbSeriesToLinearEnergy", () => {
  it("converts 0 dB to 1.0 (reference amplitude)", () => {
    const [v] = dbSeriesToLinearEnergy([0])
    expect(v).toBeCloseTo(1.0)
  })

  it("converts -20 dB to ~0.1 (log10-based scale)", () => {
    const [v] = dbSeriesToLinearEnergy([-20])
    expect(v).toBeCloseTo(0.1, 3)
  })

  it("converts -60 dB to ~0.001 (near-silence)", () => {
    const [v] = dbSeriesToLinearEnergy([-60])
    expect(v).toBeCloseTo(0.001, 4)
  })

  it("treats -Infinity as 0 (silence)", () => {
    const [v] = dbSeriesToLinearEnergy([Number.NEGATIVE_INFINITY])
    expect(v).toBe(0)
  })

  it("preserves ordering — louder dB → larger linear value", () => {
    const linear = dbSeriesToLinearEnergy([-40, -20, 0])
    expect(linear[0]).toBeLessThan(linear[1])
    expect(linear[1]).toBeLessThan(linear[2])
  })
})

describe("findLoudestWindowStart", () => {
  it("returns 0 for empty series", () => {
    expect(findLoudestWindowStart([], 5)).toBe(0)
  })

  it("returns 0 when window ≥ series length (nothing to slide)", () => {
    expect(findLoudestWindowStart([1, 2, 3], 5)).toBe(0)
  })

  it("returns 0 when window == series length exactly", () => {
    expect(findLoudestWindowStart([1, 2, 3], 3)).toBe(0)
  })

  it("finds the window with the largest sum", () => {
    // Series:  [0.1, 0.1, 0.9, 0.9, 0.1]
    // 3-window sums: 1.1 (idx 0), 1.9 (idx 1), 1.9 (idx 2)
    // Best window starts at idx 1 (tie broken by earliest).
    const linear = [0.1, 0.1, 0.9, 0.9, 0.1]
    expect(findLoudestWindowStart(linear, 3)).toBe(1)
  })

  it("handles a monotonically increasing series (best window is at the end)", () => {
    const linear = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    // Best 3-window is at idx 7 (values 8,9,10 sum 27).
    expect(findLoudestWindowStart(linear, 3)).toBe(7)
  })

  it("handles a series with a clear peak (best window centers on peak)", () => {
    // Rising then falling — best 3-window includes the peak.
    const linear = [0.1, 0.5, 0.9, 1.0, 0.9, 0.5, 0.1]
    // 3-window sums: 1.5 (0), 2.4 (1), 2.8 (2), 2.8 (3), 1.5 (4)
    // Best starts at idx 2 (tie broken by earliest).
    expect(findLoudestWindowStart(linear, 3)).toBe(2)
  })

  it("returns 0 for a windowSize of 0 (invalid caller — safe default)", () => {
    expect(findLoudestWindowStart([1, 2, 3], 0)).toBe(0)
  })

  it("returns 0 for negative windowSize (invalid caller — safe default)", () => {
    expect(findLoudestWindowStart([1, 2, 3], -5)).toBe(0)
  })

  it("simulates a 45s window over a 3-minute track — picks the loudest 45s", () => {
    // 180 seconds of per-second energy: quiet intro, loud chorus, quiet outro.
    const series: number[] = []
    for (let i = 0; i < 180; i++) {
      if (i < 30 || i > 150) series.push(0.1)         // quiet intro/outro
      else if (i >= 60 && i < 105) series.push(0.9)   // loud chorus at 1:00-1:45
      else series.push(0.4)                            // moderate verses
    }
    // The chorus (indices 60-104) is the loudest 45s → start at 60.
    expect(findLoudestWindowStart(series, 45)).toBe(60)
  })

  it("is deterministic — same input, same output", () => {
    const series = [0.1, 0.5, 0.9, 1.0, 0.9, 0.5, 0.1]
    const a = findLoudestWindowStart(series, 3)
    const b = findLoudestWindowStart(series, 3)
    const c = findLoudestWindowStart(series, 3)
    expect(a).toBe(b)
    expect(b).toBe(c)
  })
})
