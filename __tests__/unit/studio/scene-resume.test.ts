import { describe, it, expect, vi } from "vitest"

// ── Inline the pure helpers from [id]/page.tsx so we can test them ──────────
// These mirror the module-level functions exactly.

type SceneStatus = "idle" | "succeeded" | "processing" | "failed" | "pending"

function deriveStatus(s: Record<string, unknown>): SceneStatus {
  if (s.video_clip_url || s.videoClipUrl) return "succeeded"
  const phase = (s.generation_phase ?? s.generationPhase) as string | null
  if (phase === "image" || phase === "video") return "processing"
  if (phase === "failed") return "failed"
  return "idle"
}

async function pollUntilDone(
  sceneId: string,
  fetchFn: (id: string) => Promise<{ ok: boolean; scene?: Record<string, unknown> }>
): Promise<Record<string, unknown>> {
  while (true) {
    await new Promise((r) => setTimeout(r, 0)) // instant in tests
    const res = await fetchFn(sceneId)
    if (!res.ok) continue
    const { scene } = res
    if (!scene) continue
    if (scene.generation_phase === "failed") throw new Error("Scene generation failed")
    if (scene.video_clip_url) return scene
  }
}

// ── deriveStatus ─────────────────────────────────────────────────────────────

describe("deriveStatus", () => {
  describe("succeeded", () => {
    it("returns succeeded when video_clip_url is set", () => {
      expect(deriveStatus({ video_clip_url: "https://blob/clip.mp4", generation_phase: "done" })).toBe("succeeded")
    })

    it("returns succeeded when videoClipUrl (camelCase) is set", () => {
      expect(deriveStatus({ videoClipUrl: "https://blob/clip.mp4" })).toBe("succeeded")
    })

    it("succeeded takes priority over any generation_phase value", () => {
      expect(deriveStatus({ video_clip_url: "https://blob/clip.mp4", generation_phase: "video" })).toBe("succeeded")
    })
  })

  describe("processing", () => {
    it("returns processing when generation_phase is 'image'", () => {
      expect(deriveStatus({ generation_phase: "image", video_clip_url: null })).toBe("processing")
    })

    it("returns processing when generation_phase is 'video'", () => {
      expect(deriveStatus({ generation_phase: "video", video_clip_url: null })).toBe("processing")
    })

    it("returns processing when generationPhase (camelCase) is 'image'", () => {
      expect(deriveStatus({ generationPhase: "image" })).toBe("processing")
    })

    it("returns processing when generationPhase (camelCase) is 'video'", () => {
      expect(deriveStatus({ generationPhase: "video" })).toBe("processing")
    })

    it("snake_case takes priority over camelCase for generation_phase", () => {
      // snake_case from DB API response is preferred
      expect(deriveStatus({ generation_phase: "image", generationPhase: "done" })).toBe("processing")
    })
  })

  describe("failed", () => {
    it("returns failed when generation_phase is 'failed'", () => {
      expect(deriveStatus({ generation_phase: "failed" })).toBe("failed")
    })

    it("returns failed when generationPhase (camelCase) is 'failed'", () => {
      expect(deriveStatus({ generationPhase: "failed" })).toBe("failed")
    })
  })

  describe("idle", () => {
    it("returns idle when generation_phase is null", () => {
      expect(deriveStatus({ generation_phase: null, video_clip_url: null })).toBe("idle")
    })

    it("returns idle when generation_phase is undefined (new scene never generated)", () => {
      expect(deriveStatus({ video_clip_url: null })).toBe("idle")
    })

    it("returns idle when generation_phase is an unknown value", () => {
      expect(deriveStatus({ generation_phase: "queued" })).toBe("idle")
    })

    it("returns idle for an empty object", () => {
      expect(deriveStatus({})).toBe("idle")
    })
  })
})

// ── pollUntilDone ─────────────────────────────────────────────────────────────

describe("pollUntilDone", () => {
  it("resolves immediately when video_clip_url is set on first poll", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      scene: { generation_phase: "done", video_clip_url: "https://blob/clip.mp4", image_url: "https://blob/frame.jpg", audio_url: null },
    })
    const result = await pollUntilDone("scene-1", fetchFn)
    expect(result.video_clip_url).toBe("https://blob/clip.mp4")
    expect(fetchFn).toHaveBeenCalledOnce()
  })

  it("polls multiple times before resolving", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "image", video_clip_url: null } })
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "video", video_clip_url: null } })
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "done", video_clip_url: "https://blob/clip.mp4" } })

    const result = await pollUntilDone("scene-1", fetchFn)
    expect(fetchFn).toHaveBeenCalledTimes(3)
    expect(result.video_clip_url).toBe("https://blob/clip.mp4")
  })

  it("throws when generation_phase is 'failed'", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      scene: { generation_phase: "failed", video_clip_url: null },
    })
    await expect(pollUntilDone("scene-1", fetchFn)).rejects.toThrow("Scene generation failed")
  })

  it("skips non-ok responses and keeps polling", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true, scene: { generation_phase: "done", video_clip_url: "https://blob/clip.mp4" } })

    await expect(pollUntilDone("scene-1", fetchFn)).resolves.toBeDefined()
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it("returns the full scene object (image_url, audio_url included)", async () => {
    const scene = { generation_phase: "done", video_clip_url: "v.mp4", image_url: "f.jpg", audio_url: "a.wav" }
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, scene })
    const result = await pollUntilDone("scene-1", fetchFn)
    expect(result).toEqual(scene)
  })

  it("passes the correct sceneId to the fetch function", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      ok: true,
      scene: { generation_phase: "done", video_clip_url: "v.mp4" },
    })
    await pollUntilDone("my-scene-id", fetchFn)
    expect(fetchFn).toHaveBeenCalledWith("my-scene-id")
  })
})

// ── Scenario: user returns to project mid-generation ─────────────────────────
// Simulates the mapping that happens in the load() effect.

describe("scene status mapping on project load", () => {
  function mapDbScenes(dbScenes: Record<string, unknown>[]) {
    return dbScenes.map((s) => ({
      id: s.id as string,
      status: deriveStatus(s),
      videoClipUrl: (s.video_clip_url as string) ?? null,
      imageUrl: (s.image_url as string) ?? null,
    }))
  }

  it("maps a mix of phases correctly", () => {
    const db = [
      { id: "s1", generation_phase: null,    video_clip_url: null },          // never started
      { id: "s2", generation_phase: "image", video_clip_url: null },          // generating image
      { id: "s3", generation_phase: "video", video_clip_url: null },          // generating video
      { id: "s4", generation_phase: "done",  video_clip_url: "v.mp4" },       // complete
      { id: "s5", generation_phase: "failed", video_clip_url: null },         // failed
    ]
    const mapped = mapDbScenes(db)
    expect(mapped[0].status).toBe("idle")
    expect(mapped[1].status).toBe("processing")
    expect(mapped[2].status).toBe("processing")
    expect(mapped[3].status).toBe("succeeded")
    expect(mapped[4].status).toBe("failed")
  })

  it("identifies in-progress scenes that need polling resumed", () => {
    const db = [
      { id: "s1", generation_phase: "done",  video_clip_url: "v1.mp4" },
      { id: "s2", generation_phase: "image", video_clip_url: null },
      { id: "s3", generation_phase: "video", video_clip_url: null },
    ]
    const mapped = mapDbScenes(db)
    const needsPolling = mapped.filter((s) => s.status === "processing" && s.id)
    expect(needsPolling).toHaveLength(2)
    expect(needsPolling.map((s) => s.id)).toEqual(["s2", "s3"])
  })

  it("does not resume polling for idle or succeeded scenes", () => {
    const db = [
      { id: "s1", generation_phase: null,   video_clip_url: null },
      { id: "s2", generation_phase: "done", video_clip_url: "v.mp4" },
    ]
    const mapped = mapDbScenes(db)
    const needsPolling = mapped.filter((s) => s.status === "processing")
    expect(needsPolling).toHaveLength(0)
  })

  it("does not resume polling for failed scenes", () => {
    const db = [{ id: "s1", generation_phase: "failed", video_clip_url: null }]
    const mapped = mapDbScenes(db)
    expect(mapped[0].status).toBe("failed")
    const needsPolling = mapped.filter((s) => s.status === "processing")
    expect(needsPolling).toHaveLength(0)
  })
})
