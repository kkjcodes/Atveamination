import { describe, it, expect } from "vitest"

// Mirrors the prefix routing in app/api/scenes/[id]/route.ts.
// Three branches exist for image prediction status polling:
//   - "falmk:<id>"  → fal.ai Kontext Multi (shared multi-character scenes)
//   - "fal:<id>"    → fal.ai Flux Dev with LoRA (legacy fal-trained characters)
//   - otherwise     → Replicate
//
// Order matters because "falmk:" starts with "fal:" — the more specific prefix
// MUST be checked first.

type Branch = "falmk" | "fal" | "replicate"

function routeImagePrediction(predictionId: string): { branch: Branch; requestId: string } {
  if (predictionId.startsWith("falmk:")) {
    return { branch: "falmk", requestId: predictionId.slice(6) }
  }
  if (predictionId.startsWith("fal:")) {
    return { branch: "fal", requestId: predictionId.slice(4) }
  }
  return { branch: "replicate", requestId: predictionId }
}

describe("routeImagePrediction", () => {
  it("routes 'falmk:abc' to the multi-Kontext branch with the bare request id", () => {
    expect(routeImagePrediction("falmk:abc123")).toEqual({ branch: "falmk", requestId: "abc123" })
  })

  it("routes 'fal:abc' to the fluxDev/LoRA branch with the bare request id", () => {
    expect(routeImagePrediction("fal:abc123")).toEqual({ branch: "fal", requestId: "abc123" })
  })

  it("routes a bare prediction id to Replicate, untrimmed", () => {
    expect(routeImagePrediction("pred_xyz")).toEqual({ branch: "replicate", requestId: "pred_xyz" })
  })

  it("must NOT route 'falmk:' values into the 'fal:' branch — specific prefix wins", () => {
    // This is the failure mode if branches are checked in the wrong order.
    expect(routeImagePrediction("falmk:zzz").branch).toBe("falmk")
  })

  it("handles request ids that contain colons", () => {
    expect(routeImagePrediction("falmk:weird:id:value")).toEqual({ branch: "falmk", requestId: "weird:id:value" })
    expect(routeImagePrediction("fal:weird:id:value")).toEqual({ branch: "fal", requestId: "weird:id:value" })
  })

  it("treats Replicate ids that happen to contain 'fal' substring as Replicate", () => {
    expect(routeImagePrediction("predfalkjs").branch).toBe("replicate")
  })
})
