import { describe, it, expect } from "vitest"
import { validateAdScript, type ValidateContext } from "@/lib/business/adscript-schema"

// Base fixture that will pass all rules. Individual tests mutate one field
// and assert the specific error surface.
const CTX: ValidateContext = {
  validAssetIds: new Set(["asset-1", "asset-2", "asset-3"]),
  validLogoAssetId: "logo-1",
}

const OK: unknown = {
  template_family: "clean_modern",
  aspect_ratio: "9:16",
  audio: { voice: "warm_f", music_id: "clean_modern_upright", music_level: "normal" },
  style: { palette_hint: "warm", text_position: "lower_third" },
  scenes: [
    { type: "hook",    text: "Fresh bread every morning at six.", vo_text: "Every morning at six the ovens are already full and the smell fills the shop.", asset_id: "asset-1", min_seconds: 3, motion: "slow_zoom_in" },
    { type: "benefit", text: "Made from scratch, always.", vo_text: "Sourdough kneaded by hand — no shortcuts, just craft.", asset_id: "asset-2", min_seconds: 3, motion: "pan_left" },
    { type: "cta",     text: "Come taste the difference.", vo_text: "We're on Maple Street, come try one warm.", asset_id: "asset-3", min_seconds: 3, motion: "hold" },
    { type: "end_card", logo_asset_id: "logo-1", vo_text: "", lines: ["Rosie's Bakery", "123 Example Street", "Open Tue–Sun 6am–2pm"], min_seconds: 3 },
  ],
}

describe("validateAdScript", () => {
  it("passes on a well-formed script", () => {
    const errors = validateAdScript(OK, CTX)
    expect(errors).toEqual([])
  })

  it("rejects null / non-object input", () => {
    expect(validateAdScript(null, CTX).length).toBeGreaterThan(0)
    expect(validateAdScript("string", CTX).length).toBeGreaterThan(0)
    expect(validateAdScript(42, CTX).length).toBeGreaterThan(0)
  })

  it("rejects unknown template_family", () => {
    const bad = { ...(OK as object), template_family: "crayola" }
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path === "template_family")).toBe(true)
  })

  it("rejects unknown aspect_ratio", () => {
    const bad = { ...(OK as object), aspect_ratio: "4:3" }
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path === "aspect_ratio")).toBe(true)
  })

  it("rejects invalid audio.voice", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.audio.voice = "robot_x"
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path === "audio.voice")).toBe(true)
  })

  it("rejects scenes below the min (3)", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes = bad.scenes.slice(0, 2)
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.message.includes("3–7"))).toBe(true)
  })

  it("rejects scenes above the max (7)", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    // Insert 5 extra benefit scenes → 8 total
    for (let i = 0; i < 5; i++) {
      bad.scenes.splice(1, 0, { type: "benefit", text: "Fresh.", vo_text: "Good stuff.", asset_id: "asset-1", min_seconds: 3, motion: "hold" })
    }
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.message.includes("3–7"))).toBe(true)
  })

  it("rejects hook overlay > 8 words", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes[0].text = "This is a much longer hook that has too many words for an ad overlay"
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path === "scenes[0].text")).toBe(true)
  })

  it("rejects benefit overlay > 12 words", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes[1].text = "A benefit line that is deliberately too long to satisfy the twelve word overlay maximum enforced"
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path === "scenes[1].text")).toBe(true)
  })

  it("rejects vo_text > 30 words", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes[0].vo_text = Array(35).fill("word").join(" ")
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path === "scenes[0].vo_text")).toBe(true)
  })

  it("rejects missing end_card (0 end_cards)", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes = bad.scenes.slice(0, -1)  // drop end_card
    bad.scenes.push({ type: "cta", text: "Come by.", vo_text: "See you soon.", asset_id: "asset-3", min_seconds: 3, motion: "hold" })
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.message.includes("exactly one end_card"))).toBe(true)
  })

  it("rejects end_card that isn't last", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    const endCard = bad.scenes.pop()
    bad.scenes.splice(1, 0, endCard)
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.message.includes("must be the last"))).toBe(true)
  })

  it("rejects unknown asset_id", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes[0].asset_id = "asset-not-in-set"
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path === "scenes[0].asset_id")).toBe(true)
  })

  it("rejects unknown motion", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes[0].motion = "wild_dolly_zoom"
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path === "scenes[0].motion")).toBe(true)
  })

  it("rejects end_card lines > 40 chars", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes[3].lines = ["This is a very very very long line that is over the forty character cap for end card lines"]
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path.startsWith("scenes[3].lines"))).toBe(true)
  })

  it("rejects mismatched logo_asset_id", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes[3].logo_asset_id = "some-other-logo"
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.path === "scenes[3].logo_asset_id")).toBe(true)
  })

  it("accepts end_card without logo_asset_id when business has none", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    delete bad.scenes[3].logo_asset_id
    const errors = validateAdScript(bad, { ...CTX, validLogoAssetId: null })
    expect(errors).toEqual([])
  })

  it("rejects derived duration > 35s", () => {
    const bad = JSON.parse(JSON.stringify(OK))
    bad.scenes[0].vo_text = Array(30).fill("word").join(" ")  // ~12s
    bad.scenes[1].vo_text = Array(30).fill("word").join(" ")
    bad.scenes[2].vo_text = Array(30).fill("word").join(" ")
    const errors = validateAdScript(bad, CTX)
    expect(errors.some((e) => e.message.includes("derived total duration"))).toBe(true)
  })
})
