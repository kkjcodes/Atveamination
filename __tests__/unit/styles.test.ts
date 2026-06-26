import { describe, it, expect } from "vitest"
import { vi } from "vitest"

vi.mock("replicate", () => ({
  default: class MockReplicate {
    constructor(_opts: unknown) {}
  },
}))

import {
  CARTOON_STYLE_PROMPTS,
  STYLE_BATCH_1,
  STYLE_BATCH_2,
  STYLE_HINTS,
} from "@/lib/replicate/client"

const ALL_STYLES = [...STYLE_BATCH_1, ...STYLE_BATCH_2] as string[]

describe("STYLE_BATCH_1", () => {
  it("has exactly 4 styles", () => {
    expect(STYLE_BATCH_1).toHaveLength(4)
  })

  it("contains the emotionally warm styles", () => {
    expect(STYLE_BATCH_1).toContain("pixar")
    expect(STYLE_BATCH_1).toContain("anime")
    expect(STYLE_BATCH_1).toContain("ghibli")
    expect(STYLE_BATCH_1).toContain("chibi")
  })
})

describe("STYLE_BATCH_2", () => {
  it("has exactly 4 styles", () => {
    expect(STYLE_BATCH_2).toHaveLength(4)
  })

  it("contains the artistic styles", () => {
    expect(STYLE_BATCH_2).toContain("comic")
    expect(STYLE_BATCH_2).toContain("sketch")
    expect(STYLE_BATCH_2).toContain("watercolor")
    expect(STYLE_BATCH_2).toContain("claymation")
  })
})

describe("batches are disjoint and complete", () => {
  it("no style appears in both batches", () => {
    const b1 = new Set<string>(STYLE_BATCH_1)
    for (const s of STYLE_BATCH_2) {
      expect(b1.has(s)).toBe(false)
    }
  })

  it("together they cover all 8 styles", () => {
    expect(ALL_STYLES).toHaveLength(8)
  })
})

describe("CARTOON_STYLE_PROMPTS", () => {
  it("has prompts for all 8 styles", () => {
    expect(Object.keys(CARTOON_STYLE_PROMPTS)).toHaveLength(8)
    for (const style of ALL_STYLES) {
      expect(CARTOON_STYLE_PROMPTS).toHaveProperty(style)
    }
  })

  it("each prompt is a non-empty string", () => {
    for (const style of ALL_STYLES) {
      expect(typeof CARTOON_STYLE_PROMPTS[style]).toBe("string")
      expect(CARTOON_STYLE_PROMPTS[style].length).toBeGreaterThan(20)
    }
  })

  it("every prompt mentions preserving facial features", () => {
    for (const style of ALL_STYLES) {
      expect(CARTOON_STYLE_PROMPTS[style].toLowerCase()).toMatch(/facial features|face/)
    }
  })

  it("pixar prompt references Pixar or Disney", () => {
    expect(CARTOON_STYLE_PROMPTS.pixar.toLowerCase()).toMatch(/pixar|disney/)
  })

  it("ghibli prompt references Ghibli or Miyazaki", () => {
    expect(CARTOON_STYLE_PROMPTS.ghibli.toLowerCase()).toMatch(/ghibli|miyazaki/)
  })

  it("chibi prompt references chibi or kawaii", () => {
    expect(CARTOON_STYLE_PROMPTS.chibi.toLowerCase()).toMatch(/chibi|kawaii/)
  })

  it("watercolor prompt references watercolor", () => {
    expect(CARTOON_STYLE_PROMPTS.watercolor.toLowerCase()).toContain("watercolor")
  })

  it("claymation prompt references clay or Aardman", () => {
    expect(CARTOON_STYLE_PROMPTS.claymation.toLowerCase()).toMatch(/clay|aardman|laika/)
  })
})

describe("STYLE_HINTS", () => {
  it("has hints for all 8 styles plus default", () => {
    for (const style of ALL_STYLES) {
      expect(STYLE_HINTS).toHaveProperty(style)
    }
    expect(STYLE_HINTS).toHaveProperty("default")
  })

  it("each hint has an image and video field", () => {
    for (const style of [...ALL_STYLES, "default"]) {
      expect(STYLE_HINTS[style]).toHaveProperty("image")
      expect(STYLE_HINTS[style]).toHaveProperty("video")
      expect(typeof STYLE_HINTS[style].image).toBe("string")
      expect(typeof STYLE_HINTS[style].video).toBe("string")
    }
  })

  it("no hint mentions photorealism (they all suppress it)", () => {
    for (const style of ALL_STYLES) {
      expect(STYLE_HINTS[style].image.toLowerCase()).toContain("no photorealism")
      expect(STYLE_HINTS[style].video.toLowerCase()).toContain("no real-world background")
    }
  })

  it("new batch-2 hints exist and are non-trivial", () => {
    for (const style of STYLE_BATCH_2) {
      expect(STYLE_HINTS[style].image.length).toBeGreaterThan(30)
      expect(STYLE_HINTS[style].video.length).toBeGreaterThan(30)
    }
  })
})
