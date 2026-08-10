import { describe, it, expect } from "vitest"
import { decideFromScreen } from "@/lib/ai/likeness-screen-decision"

// Right-of-publicity gate: block ONLY high-confidence public-figure matches;
// resemblance and uncertainty must never lock out a real user.

describe("decideFromScreen", () => {
  it("blocks high-confidence public figures with a friendly reason", () => {
    const r = decideFromScreen({ public_figure: true, confidence: "high", name: "Famous Person" })
    expect(r.block).toBe(true)
    expect(r.reason).toContain("public figure")
  })

  it("allows medium/low confidence (mere resemblance)", () => {
    expect(decideFromScreen({ public_figure: true, confidence: "medium" }).block).toBe(false)
    expect(decideFromScreen({ public_figure: true, confidence: "low" }).block).toBe(false)
  })

  it("allows non-public figures and malformed answers (fail open)", () => {
    expect(decideFromScreen({ public_figure: false, confidence: "high" }).block).toBe(false)
    expect(decideFromScreen(null).block).toBe(false)
    expect(decideFromScreen("garbage").block).toBe(false)
    expect(decideFromScreen({}).block).toBe(false)
  })
})
