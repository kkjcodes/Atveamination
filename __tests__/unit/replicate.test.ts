import { describe, it, expect, vi } from "vitest"

vi.mock("replicate", () => {
  return {
    default: class MockReplicate {
      constructor(_opts: unknown) {}
    },
  }
})

import { MODELS, CARTOON_STYLE_PROMPTS } from "@/lib/replicate/client"

describe("MODELS", () => {
  const requiredKeys = [
    "fluxKontextPro",
    "fluxDev",
    "whisper",
    "xttsV2",
    "wan",
    "fluxLoraTrainer",
    "ffmpegConcat",
  ] as const

  it("has all required model keys", () => {
    for (const key of requiredKeys) {
      expect(MODELS).toHaveProperty(key)
    }
  })

  it("no model ID is undefined or empty", () => {
    for (const key of requiredKeys) {
      expect(MODELS[key]).toBeTruthy()
    }
  })

  it("all model IDs contain a slash (org/name format)", () => {
    for (const key of requiredKeys) {
      expect(MODELS[key]).toContain("/")
    }
  })

  it("fluxKontextPro points to black-forest-labs/flux-kontext-pro", () => {
    expect(MODELS.fluxKontextPro).toBe("black-forest-labs/flux-kontext-pro")
  })

  it("fluxDev points to black-forest-labs/flux-dev", () => {
    expect(MODELS.fluxDev).toBe("black-forest-labs/flux-dev")
  })

  it("whisper points to openai/whisper", () => {
    expect(MODELS.whisper).toBe("openai/whisper")
  })

  it("xttsV2 points to lucataco/xtts-v2", () => {
    expect(MODELS.xttsV2).toContain("lucataco/xtts-v2")
  })

  it("wan points to wavespeedai/wan-2.1-i2v-480p", () => {
    expect(MODELS.wan).toBe("wavespeedai/wan-2.1-i2v-480p")
  })

  it("fluxLoraTrainer points to ostris/flux-dev-lora-trainer", () => {
    expect(MODELS.fluxLoraTrainer).toBe("ostris/flux-dev-lora-trainer")
  })

  it("ffmpegConcat points to andreasjansson/ffmpeg", () => {
    expect(MODELS.ffmpegConcat).toBe("andreasjansson/ffmpeg")
  })
})

describe("CARTOON_STYLE_PROMPTS", () => {
  const allStyles = ["pixar", "anime", "ghibli", "chibi", "comic", "sketch", "watercolor", "claymation"] as const

  it("has all 8 style keys", () => {
    for (const style of allStyles) {
      expect(CARTOON_STYLE_PROMPTS).toHaveProperty(style)
    }
  })

  it("each style prompt is a non-empty string", () => {
    for (const style of allStyles) {
      expect(typeof CARTOON_STYLE_PROMPTS[style]).toBe("string")
      expect(CARTOON_STYLE_PROMPTS[style].length).toBeGreaterThan(0)
    }
  })

  it("pixar prompt contains style-relevant keywords", () => {
    expect(CARTOON_STYLE_PROMPTS.pixar.toLowerCase()).toMatch(/pixar|disney|3d|animated/)
  })

  it("anime prompt contains style-relevant keywords", () => {
    expect(CARTOON_STYLE_PROMPTS.anime.toLowerCase()).toMatch(/anime|manga|cel/)
  })

  it("ghibli prompt contains style-relevant keywords", () => {
    expect(CARTOON_STYLE_PROMPTS.ghibli.toLowerCase()).toMatch(/ghibli|miyazaki/)
  })

  it("chibi prompt contains style-relevant keywords", () => {
    expect(CARTOON_STYLE_PROMPTS.chibi.toLowerCase()).toMatch(/chibi|kawaii/)
  })

  it("comic prompt contains style-relevant keywords", () => {
    expect(CARTOON_STYLE_PROMPTS.comic.toLowerCase()).toMatch(/comic|superhero|ink|halftone/)
  })

  it("sketch prompt contains style-relevant keywords", () => {
    expect(CARTOON_STYLE_PROMPTS.sketch.toLowerCase()).toMatch(/sketch|pencil|hand-drawn|charcoal/)
  })

  it("watercolor prompt contains style-relevant keywords", () => {
    expect(CARTOON_STYLE_PROMPTS.watercolor.toLowerCase()).toContain("watercolor")
  })

  it("claymation prompt contains style-relevant keywords", () => {
    expect(CARTOON_STYLE_PROMPTS.claymation.toLowerCase()).toMatch(/clay|aardman|laika/)
  })

  it("has exactly 8 style keys", () => {
    expect(Object.keys(CARTOON_STYLE_PROMPTS)).toHaveLength(8)
  })
})
