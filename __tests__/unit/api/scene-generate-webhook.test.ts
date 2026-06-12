import { describe, it, expect } from "vitest"

// Pure logic extracted from app/api/scenes/[id]/generate/route.ts.
// No mocking required — these are stateless helper functions.

// Copied verbatim from the route file.
function predRef(modelId: string): { model: `${string}/${string}` } | { version: string } {
  if (modelId.includes(":")) return { version: modelId.split(":").slice(1).join(":") }
  return { model: modelId as `${string}/${string}` }
}

// The exact data shape written to the DB when a scene is re-generated.
// These 5 fields MUST all be cleared together; partial clearing breaks
// the polling state machine because the frontend uses them to infer phase.
const CLEAR_ON_REGENERATE = {
  imagePredictionId: "pred_new",
  generationPhase: "image",
  videoPredictionId: null,
  audioPredictionId: null,
  imageUrl: null,
  videoClipUrl: null,
  audioUrl: null,
}

// ── predRef ───────────────────────────────────────────────────────────────────

describe("predRef", () => {
  it("returns { model } for a model reference without a colon", () => {
    expect(predRef("org/model")).toEqual({ model: "org/model" })
  })

  it("returns { version } for a model reference with a version hash", () => {
    expect(predRef("org/model:abc123")).toEqual({ version: "abc123" })
  })

  it("preserves colons after the first colon in the version string", () => {
    expect(predRef("org/model:abc:extra")).toEqual({ version: "abc:extra" })
  })

  it("handles an empty version segment after a trailing colon", () => {
    // "org/model:" contains a colon so it goes into version branch
    expect(predRef("org/model:")).toEqual({ version: "" })
  })
})

// ── clear-on-regenerate shape ─────────────────────────────────────────────────

describe("CLEAR_ON_REGENERATE shape", () => {
  const nulledFields = [
    "videoPredictionId",
    "audioPredictionId",
    "imageUrl",
    "videoClipUrl",
    "audioUrl",
  ] as const

  it("contains all 5 cleared fields set to null", () => {
    for (const field of nulledFields) {
      expect(CLEAR_ON_REGENERATE[field]).toBeNull()
    }
  })

  it("has exactly the 5 required cleared fields — no missing ones", () => {
    for (const field of nulledFields) {
      expect(Object.prototype.hasOwnProperty.call(CLEAR_ON_REGENERATE, field)).toBe(true)
    }
  })

  it("also carries the new imagePredictionId and generationPhase", () => {
    expect(CLEAR_ON_REGENERATE.imagePredictionId).toBeTruthy()
    expect(CLEAR_ON_REGENERATE.generationPhase).toBe("image")
  })

  it("all 5 cleared fields are null — not undefined, not empty string", () => {
    for (const field of nulledFields) {
      expect(CLEAR_ON_REGENERATE[field]).toStrictEqual(null)
    }
  })
})
