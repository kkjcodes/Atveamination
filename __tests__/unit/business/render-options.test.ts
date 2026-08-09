import { describe, it, expect } from "vitest"
import { captionFragment, contactStripFragment, splitCaption } from "@/lib/business/render/text-overlay"
import { qrTarget } from "@/lib/business/render/qr"
import { pickDominantHex } from "@/lib/business/render/brand-color"
import { scriptWithAspect } from "@/lib/business/aspect-variants"
import type { AdScript } from "@/lib/business/adscript-schema"

describe("captionFragment", () => {
  it("renders boxed subtitle near the bottom", () => {
    const f = captionFragment("Fresh pastries every morning", 1080, 1920, null)
    expect(f).toContain("drawtext=")
    expect(f).toContain("box=1")
    expect(f).toContain("Fresh pastries every morning")
  })
  it("bottomReserved lifts the caption above a band", () => {
    const flat = captionFragment("hello", 1080, 1920, null, 0)
    const lifted = captionFragment("hello", 1080, 1920, null, 600)
    const yOf = (s: string) => Number(/y=(\d+)/.exec(s)![1])
    expect(yOf(lifted)).toBe(yOf(flat) - 600)
  })
})

describe("splitCaption", () => {
  it("keeps short captions on one line", () => {
    expect(splitCaption("Fresh pastries every morning")).toEqual(["Fresh pastries every morning"])
  })
  it("splits long narration into two balanced lines at a word boundary", () => {
    const long = "A stunning new rental just hit the market in the heart of Ridgeview and it will not last long"
    const lines = splitCaption(long)
    expect(lines.length).toBe(2)
    expect(lines.join(" ")).toBe(long)
    expect(Math.abs(lines[0].length - lines[1].length)).toBeLessThan(15)
  })
  it("two-line captions never sink below a readable size", () => {
    const long = "A stunning new rental just hit the market in the heart of Ridgeview and it will not last long"
    const f = captionFragment(long, 1080, 1920, null)
    const sizes = [...f.matchAll(/fontsize=(\d+)/g)].map((m) => Number(m[1]))
    expect(sizes.length).toBe(2)
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(28)
  })
})

describe("contactStripFragment", () => {
  it("small chip near the top", () => {
    const f = contactStripFragment("555-013-0142", 1080, 1920, null)
    expect(f).toContain("555-013-0142")
    const y = Number(/y=(\d+)/.exec(f)![1])
    expect(y).toBeLessThan(1920 * 0.1)
  })
})

describe("qrTarget", () => {
  it("prefers website, normalizes scheme", () => {
    expect(qrTarget("example.com", "555-013-0142")).toBe("https://example.com")
    expect(qrTarget("https://example.com", null)).toBe("https://example.com")
  })
  it("falls back to tel:, stripping formatting", () => {
    expect(qrTarget(null, "555-013-0142")).toBe("tel:5550130142")
    expect(qrTarget("", "+1 (555) 013-0142")).toBe("tel:+15550130142")
  })
  it("null when no contact", () => {
    expect(qrTarget(null, null)).toBeNull()
    expect(qrTarget("  ", "")).toBeNull()
  })
})

describe("pickDominantHex", () => {
  const px = (rgba: number[][], n = 1) => {
    const out: number[] = []
    for (let i = 0; i < n; i++) for (const p of rgba) out.push(...p)
    return Buffer.from(out)
  }
  it("finds the dominant saturated color", () => {
    // Mostly orange with some gray noise.
    const pixels = px([[230, 100, 20, 255], [230, 100, 20, 255], [230, 100, 20, 255], [128, 128, 128, 255]], 8)
    const hex = pickDominantHex(pixels, 4)
    expect(hex).toMatch(/^0x[0-9A-F]{6}$/)
    const r = parseInt(hex!.slice(2, 4), 16)
    const b = parseInt(hex!.slice(6, 8), 16)
    expect(r).toBeGreaterThan(180)
    expect(b).toBeLessThan(80)
  })
  it("returns null for grayscale logos", () => {
    const pixels = px([[128, 128, 128, 255], [40, 40, 40, 255], [250, 250, 250, 255]], 8)
    expect(pickDominantHex(pixels, 4)).toBeNull()
  })
  it("ignores transparent padding", () => {
    const pixels = px([[230, 30, 30, 255], [0, 200, 0, 10]], 8)
    const hex = pickDominantHex(pixels, 4)
    const r = parseInt(hex!.slice(2, 4), 16)
    expect(r).toBeGreaterThan(180)
  })
})

describe("scriptWithAspect", () => {
  it("swaps only the aspect ratio", () => {
    const script = { template_family: "clean_modern", aspect_ratio: "9:16", scenes: [] } as unknown as AdScript
    const out = scriptWithAspect(script, "16:9")
    expect(out.aspect_ratio).toBe("16:9")
    expect(out.template_family).toBe("clean_modern")
    expect(script.aspect_ratio).toBe("9:16") // no mutation
  })
})
