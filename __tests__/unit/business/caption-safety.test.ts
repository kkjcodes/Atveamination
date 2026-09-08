import { describe, it, expect } from "vitest"
import {
  layoutCaption,
  wrapToWidth,
  lineFits,
  captionFragment,
  captionBlockTopY,
  usableTextWidth,
  CAPTION_BOTTOM_SAFE_FRAC,
} from "@/lib/business/render/text-overlay"

// Regression guard for the 2026-09-08 caption bugs:
//   1. long captions clipped off both frame edges (splitCaption capped at 2
//      lines + a 24px floor → 1295px of text in a 952px area)
//   2. captions rendered under the platform UI (2% bottom margin)
// These tests make BOTH impossible to reintroduce: every caption line must
// fit the usable width, and the block must sit above the bottom safe zone,
// for a battery of realistic caption lengths across all three aspect ratios.

const ASPECTS: Array<[string, number, number]> = [
  ["9:16", 1080, 1920],
  ["1:1", 1080, 1080],
  ["16:9", 1920, 1080],
]

const CAPTIONS = [
  "Fresh flowers daily",
  "Come taste the difference at our bakery",
  "This Raksha Bandhan, find beautiful Rakhis for every bond at Konark Grocers",
  // The exact class that shipped broken — a full 26-word vo_text:
  "Celebrate Ganesh Chaturthi with beautiful decorated murtis in every size, plus all your pooja essentials, fresh flowers, sweets and more at Konark Grocers this festive season",
  // Pathological: a single very long unbroken token.
  "Supercalifragilisticexpialidocious",
  "A".repeat(120),
]

describe("layoutCaption — never overflows the frame", () => {
  for (const [name, w, h] of ASPECTS) {
    for (const cap of CAPTIONS) {
      it(`${name}: "${cap.slice(0, 32)}…" every line fits`, () => {
        const { lines, fontSize } = layoutCaption(cap, w, h)
        expect(lines.length).toBeGreaterThan(0)
        for (const line of lines) {
          expect(
            lineFits(line, w, fontSize),
            `line overflows: "${line}" @ ${fontSize}px (usable ${usableTextWidth(w)}px)`,
          ).toBe(true)
        }
      })
    }
  }

  it("preserves the full caption text (nothing dropped in wrapping)", () => {
    const cap = CAPTIONS[3]
    const { lines } = layoutCaption(cap, 1080, 1920)
    expect(lines.join(" ").replace(/\s+/g, " ")).toBe(cap.replace(/\s+/g, " "))
  })

  it("stays readable — does not shrink below ~18px on a 1920 frame", () => {
    const { fontSize } = layoutCaption(CAPTIONS[3], 1080, 1920)
    expect(fontSize).toBeGreaterThanOrEqual(18)
  })
})

describe("caption stays in the bottom safe zone", () => {
  for (const [name, w, h] of ASPECTS) {
    it(`${name}: block bottom clears the platform UI zone`, () => {
      const cap = CAPTIONS[3]
      const { lines, fontSize } = layoutCaption(cap, w, h)
      const lineGap = Math.round(fontSize * 0.4)
      const topY = captionBlockTopY(h, fontSize, lines.length, lineGap, 0)
      const blockBottom = topY + (lines.length - 1) * (fontSize + lineGap) + fontSize
      const safeLimit = h - Math.round(h * CAPTION_BOTTOM_SAFE_FRAC)
      expect(blockBottom).toBeLessThanOrEqual(safeLimit + 1)
      expect(topY).toBeGreaterThan(0)
    })
  }
})

describe("captionFragment output invariants", () => {
  it("emits one drawtext per line, no enable windows, box present", () => {
    const f = captionFragment(CAPTIONS[3], 1080, 1920, null)
    const { lines } = layoutCaption(CAPTIONS[3], 1080, 1920)
    expect((f.match(/drawtext=/g) ?? []).length).toBe(lines.length)
    expect(f).not.toContain("enable=")
    expect(f).toContain("box=1")
  })
  it("empty caption yields empty output, not a broken filter", () => {
    expect(captionFragment("", 1080, 1920, null)).toBe("")
    expect(captionFragment("   ", 1080, 1920, null)).toBe("")
  })
})

describe("wrapToWidth basics", () => {
  it("keeps every wrapped line within the usable width", () => {
    const lines = wrapToWidth(CAPTIONS[2], 1080, 40)
    for (const l of lines) expect(lineFits(l, 1080, 40)).toBe(true)
  })
})
