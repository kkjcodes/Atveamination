import { describe, it, expect, vi, beforeEach } from "vitest"
import { orchestrateSceneGeneration } from "@/lib/studio/orchestrate"
import type { GenerationItem, GenerationFns } from "@/lib/studio/orchestrate"

// ── Helpers ──────────────────────────────────────────────────────────────────

type Call = { fn: string; sceneId: string; at: number }

function makeTrackedFns(
  overrides: Partial<{
    pollImageReadyResolveAfter: number   // how many polls before imageUrl appears
    pollImageReadyFails: boolean
    startGenerationFails: (sceneId: string) => boolean
  }> = {}
): { fns: GenerationFns; calls: Call[] } {
  const calls: Call[] = []
  let tick = 0

  const fns: GenerationFns = {
    startGeneration: vi.fn(async (sceneId) => {
      calls.push({ fn: "startGeneration", sceneId, at: tick++ })
      if (overrides.startGenerationFails?.(sceneId)) return
    }),
    pollImageReady: vi.fn(async (sceneId) => {
      calls.push({ fn: "pollImageReady", sceneId, at: tick++ })
      if (overrides.pollImageReadyFails) throw new Error("Scene generation failed")
    }),
    pollDone: vi.fn(async (sceneId) => {
      calls.push({ fn: "pollDone", sceneId, at: tick++ })
    }),
  }

  return { fns, calls }
}

function item(orderIndex: number): GenerationItem {
  return { sceneId: `scene-${orderIndex}`, orderIndex }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("orchestrateSceneGeneration", () => {

  describe("empty input", () => {
    it("returns immediately without calling any fn", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration([], fns)
      expect(fns.startGeneration).not.toHaveBeenCalled()
      expect(fns.pollImageReady).not.toHaveBeenCalled()
      expect(fns.pollDone).not.toHaveBeenCalled()
    })
  })

  describe("single scene", () => {
    it("calls startGeneration then pollDone (no pollImageReady needed)", async () => {
      const { fns, calls } = makeTrackedFns()
      await orchestrateSceneGeneration([item(0)], fns)

      expect(fns.startGeneration).toHaveBeenCalledOnce()
      expect(fns.pollImageReady).not.toHaveBeenCalled()
      expect(fns.pollDone).toHaveBeenCalledOnce()

      const startAt = calls.find((c) => c.fn === "startGeneration")!.at
      const doneAt = calls.find((c) => c.fn === "pollDone")!.at
      expect(startAt).toBeLessThan(doneAt)
    })

    it("does not call pollImageReady even when the single scene is scene 1", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration([item(0)], fns)
      expect(fns.pollImageReady).not.toHaveBeenCalled()
    })

    it("works for a single non-scene-1 scene", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration([item(2)], fns)
      expect(fns.startGeneration).toHaveBeenCalledWith("scene-2")
      expect(fns.pollDone).toHaveBeenCalledWith("scene-2")
      expect(fns.pollImageReady).not.toHaveBeenCalled()
    })
  })

  describe("multiple scenes — scene 1 in batch", () => {
    it("calls startGeneration for scene 1 before pollImageReady", async () => {
      const { fns, calls } = makeTrackedFns()
      await orchestrateSceneGeneration([item(0), item(1), item(2)], fns)

      const startScene1At = calls.find((c) => c.fn === "startGeneration" && c.sceneId === "scene-0")!.at
      const pollImageAt = calls.find((c) => c.fn === "pollImageReady")!.at
      expect(startScene1At).toBeLessThan(pollImageAt)
    })

    it("calls pollImageReady before startGeneration for scene 2 and beyond", async () => {
      const { fns, calls } = makeTrackedFns()
      await orchestrateSceneGeneration([item(0), item(1), item(2)], fns)

      const pollImageAt = calls.find((c) => c.fn === "pollImageReady")!.at
      const startScene2At = calls.find((c) => c.fn === "startGeneration" && c.sceneId === "scene-1")!.at
      const startScene3At = calls.find((c) => c.fn === "startGeneration" && c.sceneId === "scene-2")!.at
      expect(pollImageAt).toBeLessThan(startScene2At)
      expect(pollImageAt).toBeLessThan(startScene3At)
    })

    it("calls pollImageReady exactly once (for scene 1 only)", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration([item(0), item(1), item(2), item(3)], fns)
      expect(fns.pollImageReady).toHaveBeenCalledOnce()
      expect(fns.pollImageReady).toHaveBeenCalledWith("scene-0")
    })

    it("calls pollDone for all scenes including scene 1", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration([item(0), item(1), item(2)], fns)
      expect(fns.pollDone).toHaveBeenCalledTimes(3)
      expect(fns.pollDone).toHaveBeenCalledWith("scene-0")
      expect(fns.pollDone).toHaveBeenCalledWith("scene-1")
      expect(fns.pollDone).toHaveBeenCalledWith("scene-2")
    })

    it("calls startGeneration for scene 1 exactly once", async () => {
      const { fns, calls } = makeTrackedFns()
      await orchestrateSceneGeneration([item(0), item(1)], fns)
      const scene1Starts = calls.filter((c) => c.fn === "startGeneration" && c.sceneId === "scene-0")
      expect(scene1Starts).toHaveLength(1)
    })

    it("starts scene 1 before any other scene's startGeneration", async () => {
      const { fns, calls } = makeTrackedFns()
      await orchestrateSceneGeneration([item(0), item(1), item(2), item(3)], fns)

      const startScene1At = calls.find((c) => c.fn === "startGeneration" && c.sceneId === "scene-0")!.at
      const otherStarts = calls.filter(
        (c) => c.fn === "startGeneration" && c.sceneId !== "scene-0"
      )
      for (const s of otherStarts) {
        expect(startScene1At).toBeLessThan(s.at)
      }
    })

    it("handles items passed in reverse order (still uses scene 1 as anchor)", async () => {
      const { fns, calls } = makeTrackedFns()
      // Pass scene 3 first, then scene 1 — should still sort and treat scene 1 as anchor
      await orchestrateSceneGeneration([item(3), item(1), item(0), item(2)], fns)

      const startScene1At = calls.find((c) => c.fn === "startGeneration" && c.sceneId === "scene-0")!.at
      const pollImageAt = calls.find((c) => c.fn === "pollImageReady")!.at
      expect(startScene1At).toBeLessThan(pollImageAt)
    })

    it("handles items passed in reverse order (pollImageReady before scenes 2-N)", async () => {
      const { fns, calls } = makeTrackedFns()
      await orchestrateSceneGeneration([item(2), item(0), item(1)], fns)

      const pollImageAt = calls.find((c) => c.fn === "pollImageReady")!.at
      const laterStarts = calls.filter(
        (c) => c.fn === "startGeneration" && c.sceneId !== "scene-0"
      )
      for (const s of laterStarts) {
        expect(pollImageAt).toBeLessThan(s.at)
      }
    })
  })

  describe("multiple scenes — scene 1 NOT in batch (already generated)", () => {
    it("does NOT call pollImageReady when lowest orderIndex is not 0", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration([item(1), item(2), item(3)], fns)
      expect(fns.pollImageReady).not.toHaveBeenCalled()
    })

    it("calls startGeneration for all scenes", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration([item(1), item(2), item(3)], fns)
      expect(fns.startGeneration).toHaveBeenCalledTimes(3)
    })

    it("calls pollDone for all scenes", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration([item(1), item(2), item(3)], fns)
      expect(fns.pollDone).toHaveBeenCalledTimes(3)
    })
  })

  describe("error propagation", () => {
    it("propagates when pollImageReady throws (scene 1 image generation failed)", async () => {
      const { fns } = makeTrackedFns({ pollImageReadyFails: true })
      await expect(
        orchestrateSceneGeneration([item(0), item(1)], fns)
      ).rejects.toThrow("Scene generation failed")
    })

    it("does not call startGeneration for scenes 2-N when pollImageReady throws", async () => {
      const { fns, calls } = makeTrackedFns({ pollImageReadyFails: true })
      await expect(
        orchestrateSceneGeneration([item(0), item(1), item(2)], fns)
      ).rejects.toThrow()

      const laterStarts = calls.filter(
        (c) => c.fn === "startGeneration" && c.sceneId !== "scene-0"
      )
      expect(laterStarts).toHaveLength(0)
    })

    it("still starts scene 1 even when it is the only scene (no propagation)", async () => {
      const { fns } = makeTrackedFns({ pollImageReadyFails: true })
      // Single scene → pollImageReady is never called → no throw
      await expect(
        orchestrateSceneGeneration([item(0)], fns)
      ).resolves.toBeUndefined()
      expect(fns.startGeneration).toHaveBeenCalledOnce()
    })
  })

  describe("correct fn arguments", () => {
    it("passes each scene's sceneId to startGeneration", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration(
        [{ sceneId: "abc-123", orderIndex: 0 }, { sceneId: "def-456", orderIndex: 1 }],
        fns
      )
      expect(fns.startGeneration).toHaveBeenCalledWith("abc-123")
      expect(fns.startGeneration).toHaveBeenCalledWith("def-456")
    })

    it("passes scene 1's sceneId to pollImageReady", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration(
        [{ sceneId: "anchor-id", orderIndex: 0 }, { sceneId: "dep-id", orderIndex: 1 }],
        fns
      )
      expect(fns.pollImageReady).toHaveBeenCalledWith("anchor-id")
    })

    it("passes each scene's sceneId to pollDone", async () => {
      const { fns } = makeTrackedFns()
      await orchestrateSceneGeneration(
        [{ sceneId: "s1", orderIndex: 0 }, { sceneId: "s2", orderIndex: 1 }],
        fns
      )
      expect(fns.pollDone).toHaveBeenCalledWith("s1")
      expect(fns.pollDone).toHaveBeenCalledWith("s2")
    })
  })

  describe("pollDone ordering", () => {
    it("calls pollDone only after all startGeneration calls are complete", async () => {
      const { fns, calls } = makeTrackedFns()
      await orchestrateSceneGeneration([item(0), item(1), item(2)], fns)

      const lastStartAt = Math.max(
        ...calls.filter((c) => c.fn === "startGeneration").map((c) => c.at)
      )
      const firstDoneAt = Math.min(
        ...calls.filter((c) => c.fn === "pollDone").map((c) => c.at)
      )
      expect(lastStartAt).toBeLessThan(firstDoneAt)
    })
  })
})

// ── pollUntilImageReady behavior (pure logic) ──────────────────────────────
// Tests the polling loop logic extracted as a standalone async function,
// matching the implementation in the component.

async function pollUntilImageReady(
  fetchFn: (sceneId: string) => Promise<{ ok: boolean; scene?: { generation_phase: string; image_url: string | null } }>,
  sceneId: string,
  delayMs = 0  // 0 in tests to avoid real delays
): Promise<void> {
  while (true) {
    await new Promise((r) => setTimeout(r, delayMs))
    const res = await fetchFn(sceneId)
    if (!res.ok) continue
    const { scene } = res
    if (!scene) continue
    if (scene.generation_phase === "failed") throw new Error("Scene generation failed")
    if (scene.image_url) return
  }
}

describe("pollUntilImageReady logic", () => {
  it("resolves immediately when image_url is set on the first response", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      scene: { generation_phase: "image", image_url: "https://blob/frame.jpg" },
    })
    await expect(pollUntilImageReady(fetchFn, "scene-1")).resolves.toBeUndefined()
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it("polls multiple times before resolving when image_url is initially null", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "image", image_url: null } })
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "image", image_url: null } })
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "image", image_url: "https://blob/frame.jpg" } })

    await expect(pollUntilImageReady(fetchFn, "scene-1")).resolves.toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("throws when generation_phase is 'failed'", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      scene: { generation_phase: "failed", image_url: null },
    })
    await expect(pollUntilImageReady(fetchFn, "scene-1")).rejects.toThrow("Scene generation failed")
  })

  it("skips non-ok responses and keeps polling", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "image", image_url: "https://blob/frame.jpg" } })

    await expect(pollUntilImageReady(fetchFn, "scene-1")).resolves.toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("resolves correctly when image_url appears after a 'video' phase (webhook beat the poller)", async () => {
    // The webhook transitions image→video, so by the time the poller checks,
    // generation_phase may already be "video" but image_url is set.
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      scene: { generation_phase: "video", image_url: "https://blob/frame.jpg" },
    })
    await expect(pollUntilImageReady(fetchFn, "scene-1")).resolves.toBeUndefined()
  })

  it("does not resolve when image_url is null even if generation_phase is 'video'", async () => {
    // Shouldn't happen in practice, but test the guard
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "video", image_url: null } })
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "video", image_url: "https://blob/frame.jpg" } })

    await expect(pollUntilImageReady(fetchFn, "scene-1")).resolves.toBeUndefined()
    expect(fetchFn).toHaveBeenCalledTimes(2)
  })
})
