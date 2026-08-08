import { describe, it, expect } from "vitest"
import { chunkPlanForDuration, chunkPlanForScene } from "@/lib/video/chunk-plan"

describe("chunkPlanForDuration", () => {
  it("single chunk at or below 6.25s, clamped to WAN's 81-frame minimum", () => {
    expect(chunkPlanForDuration(3).framesPerChunk).toEqual([81])
    expect(chunkPlanForDuration(6).framesPerChunk).toEqual([96])
    expect(chunkPlanForDuration(6.25).framesPerChunk).toEqual([100])
  })

  it("chains chunks past 6.25s", () => {
    expect(chunkPlanForDuration(10).framesPerChunk).toEqual([100, 81])
  })

  it("defaults to 6s when duration missing", () => {
    expect(chunkPlanForDuration(null).framesPerChunk).toEqual([96])
  })
})

describe("chunkPlanForScene (audio-aware)", () => {
  it("short narration shrinks the plan to the 81-frame billing floor", () => {
    // 6 words / 2.2 wps + 0.5s pad ≈ 3.2s → 81 frames instead of 96.
    const plan = chunkPlanForScene(6, "Paris finally after all these years")
    expect(plan.framesPerChunk).toEqual([81])
    expect(plan.targetSeconds).toBeLessThan(4)
  })

  it("never extends past the scene target for long narration", () => {
    const longText = Array(60).fill("word").join(" ") // ~27s natural speech
    const plan = chunkPlanForScene(6, longText)
    expect(plan.targetSeconds).toBe(6)
    expect(plan.framesPerChunk).toEqual([96])
  })

  it("falls back to the duration-only plan with no narration text", () => {
    expect(chunkPlanForScene(6, "")).toEqual(chunkPlanForDuration(6))
    expect(chunkPlanForScene(6, null)).toEqual(chunkPlanForDuration(6))
  })

  it("multi-chunk scenes shrink when narration is shorter than the target", () => {
    // 20 words ≈ 9.6s < 12s target → still 2 chunks but smaller second chunk.
    const text = Array(20).fill("word").join(" ")
    const plan = chunkPlanForScene(12, text)
    expect(plan.framesPerChunk.length).toBe(2)
    expect(plan.framesPerChunk[1]).toBeLessThan(chunkPlanForDuration(12).framesPerChunk[1])
  })
})
