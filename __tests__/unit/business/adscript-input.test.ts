import { describe, it, expect } from "vitest"
import {
  coerceAspectRatio,
  coerceTemplateFamily,
  makeAdScriptInput,
  enforcePhotoOrder,
} from "@/lib/business/adscript-input"

describe("coerceTemplateFamily", () => {
  it("accepts each known family", () => {
    expect(coerceTemplateFamily("clean_modern")).toBe("clean_modern")
    expect(coerceTemplateFamily("bold_promo")).toBe("bold_promo")
    expect(coerceTemplateFamily("scrapbook")).toBe("scrapbook")
  })
  it("returns null for unknown / wrong type", () => {
    expect(coerceTemplateFamily("crayola")).toBeNull()
    expect(coerceTemplateFamily(42)).toBeNull()
    expect(coerceTemplateFamily(null)).toBeNull()
    expect(coerceTemplateFamily(undefined)).toBeNull()
  })
})

describe("coerceAspectRatio", () => {
  it("accepts each known ratio", () => {
    expect(coerceAspectRatio("9:16")).toBe("9:16")
    expect(coerceAspectRatio("1:1")).toBe("1:1")
    expect(coerceAspectRatio("16:9")).toBe("16:9")
  })
  it("returns null for 4:3 (not supported)", () => {
    expect(coerceAspectRatio("4:3")).toBeNull()
  })
  it("returns null for non-string", () => {
    expect(coerceAspectRatio(9)).toBeNull()
  })
})

describe("makeAdScriptInput", () => {
  it("returns the shape the generator expects", () => {
    const input = makeAdScriptInput(
      { name: "Rosie's Bakery", oneLiner: "Fresh bread", address: null, notes: null, logoAssetId: "logo-1" },
      [{ assetId: "a1", mimeType: "image/jpeg", buffer: Buffer.from([]) }],
      "clean_modern",
      "9:16",
      [{ id: "clean_modern_upright", label: "Upright piano" }],
    )
    expect(input.businessName).toBe("Rosie's Bakery")
    expect(input.oneLiner).toBe("Fresh bread")
    expect(input.templateFamily).toBe("clean_modern")
    expect(input.aspectRatio).toBe("9:16")
    expect(input.logoAssetId).toBe("logo-1")
    expect(input.availableMusic).toEqual([{ id: "clean_modern_upright", label: "Upright piano" }])
    expect(input.photos.length).toBe(1)
  })

  it("preserves null address/notes/logoAssetId (optional fields)", () => {
    const input = makeAdScriptInput(
      { name: "Rosie", oneLiner: "One liner", address: null, notes: null, logoAssetId: null },
      [],
      "bold_promo",
      "1:1",
      [],
    )
    expect(input.address).toBeNull()
    expect(input.notes).toBeNull()
    expect(input.logoAssetId).toBeNull()
  })
})

describe("enforcePhotoOrder", () => {
  const scene = (assetId: string, type = "benefit") => ({
    type, text: "t", vo_text: "v", asset_id: assetId, min_seconds: 3, motion: "hold",
  })
  const endCard = { type: "end_card", lines: ["Biz"], min_seconds: 3 }
  const script = (scenes: unknown[]) => ({
    template_family: "clean_modern", aspect_ratio: "9:16",
    audio: { voice: "warm_f", music_id: "m1", music_level: "normal" },
    style: { palette_hint: "warm", text_position: "lower_third" },
    scenes,
  }) as never

  it("re-sorts photo assignments into user order, keeping scene order", () => {
    const out = enforcePhotoOrder(script([scene("c", "hook"), scene("a"), scene("b", "cta"), endCard]), ["a", "b", "c"])
    expect(out.scenes.map((s) => (s as { asset_id?: string }).asset_id)).toEqual(["a", "b", "c", undefined])
    expect(out.scenes.map((s) => s.type)).toEqual(["hook", "benefit", "cta", "end_card"])
  })

  it("keeps already-ordered assignments untouched", () => {
    const out = enforcePhotoOrder(script([scene("a", "hook"), scene("c"), endCard]), ["a", "b", "c"])
    expect(out.scenes.map((s) => (s as { asset_id?: string }).asset_id)).toEqual(["a", "c", undefined])
  })

  it("handles duplicate asset ids stably", () => {
    const out = enforcePhotoOrder(script([scene("b", "hook"), scene("a"), scene("b", "cta"), endCard]), ["a", "b"])
    expect(out.scenes.map((s) => (s as { asset_id?: string }).asset_id)).toEqual(["a", "b", "b", undefined])
  })

  it("does not mutate the input script", () => {
    const input = script([scene("b", "hook"), scene("a"), endCard])
    enforcePhotoOrder(input, ["a", "b"])
    expect((input as { scenes: { asset_id?: string }[] }).scenes[0].asset_id).toBe("b")
  })
})
