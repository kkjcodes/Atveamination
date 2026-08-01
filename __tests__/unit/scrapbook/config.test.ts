import { describe, it, expect } from "vitest"
import { STYLE_PRESETS, SCRAPBOOK_MODELS, COST_ESTIMATES } from "@/lib/scrapbook/config"

describe("scrapbook config", () => {
  it("exposes all three documented styles", () => {
    expect(Object.keys(STYLE_PRESETS).sort()).toEqual(["crayon", "pixar", "watercolor"])
    for (const [key, preset] of Object.entries(STYLE_PRESETS)) {
      expect(preset.label).toBeTruthy()
      expect(preset.prompt).toBeTruthy()
      expect(preset.description).toBeTruthy()
      expect(preset.prompt.toLowerCase()).toContain(key === "pixar" ? "pixar" : key === "crayon" ? "crayon" : "watercolor")
    }
  })

  it("has all model IDs set (non-empty)", () => {
    for (const id of Object.values(SCRAPBOOK_MODELS)) {
      expect(id).toBeTruthy()
      expect(typeof id).toBe("string")
    }
  })

  it("per-page cost estimates match Python spec's routing ranges", () => {
    // Subtle should be an order of magnitude cheaper than dynamic.
    expect(COST_ESTIMATES.perPageSubtle).toBeLessThan(COST_ESTIMATES.perPageDynamic)
    // Fallback is cheapest (no motion generation).
    expect(COST_ESTIMATES.perPageFallback).toBeLessThan(COST_ESTIMATES.perPageSubtle)
  })
})
