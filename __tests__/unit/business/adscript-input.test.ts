import { describe, it, expect } from "vitest"
import {
  coerceAspectRatio,
  coerceTemplateFamily,
  makeAdScriptInput,
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
