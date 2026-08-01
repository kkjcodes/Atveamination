import { describe, it, expect } from "vitest"
import { buildRevertVersion } from "@/lib/business/iterate-revert"
import type { AdScript } from "@/lib/business/adscript-schema"

const SAMPLE_SCRIPT: AdScript = {
  template_family: "clean_modern",
  aspect_ratio: "9:16",
  audio: { voice: "warm_f", music_id: "clean_modern_upright", music_level: "normal" },
  style: { palette_hint: "warm", text_position: "lower_third" },
  scenes: [
    { type: "hook",     text: "Fresh bread.",           vo_text: "Morning bread starts at six.", asset_id: "a1", min_seconds: 3, motion: "slow_zoom_in" },
    { type: "cta",      text: "Come by.",               vo_text: "See you on Maple Street.",     asset_id: "a2", min_seconds: 3, motion: "hold" },
    { type: "end_card", lines: ["Rosie's Bakery", "Open 6am"], min_seconds: 3 },
  ],
}

describe("buildRevertVersion", () => {
  it("copies the source script verbatim into the new version payload", () => {
    const payload = buildRevertVersion(SAMPLE_SCRIPT, 5, 2)
    expect(payload.adScript).toBe(SAMPLE_SCRIPT)
    expect(payload.versionNo).toBe(5)
  })

  it("records a human-readable editRequest naming the source version", () => {
    const payload = buildRevertVersion(SAMPLE_SCRIPT, 5, 2)
    expect(payload.editRequest).toContain("version 2")
  })

  it("does not mutate the source script", () => {
    const before = JSON.stringify(SAMPLE_SCRIPT)
    buildRevertVersion(SAMPLE_SCRIPT, 5, 2)
    expect(JSON.stringify(SAMPLE_SCRIPT)).toBe(before)
  })

  it("assigns the next version number caller provides (append-only invariant)", () => {
    expect(buildRevertVersion(SAMPLE_SCRIPT, 42, 3).versionNo).toBe(42)
    expect(buildRevertVersion(SAMPLE_SCRIPT, 1, 0).versionNo).toBe(1)
  })
})
