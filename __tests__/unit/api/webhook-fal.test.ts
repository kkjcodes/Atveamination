import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks (must be declared before any import of the module under test) ───────

const mockUpdateMany = vi.fn()
const mockFindFirst = vi.fn()
const mockSceneUpdate = vi.fn()
const mockSceneFindUnique = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scene: {
      updateMany: mockUpdateMany,
      findFirst: mockFindFirst,
      update: mockSceneUpdate,
      findUnique: mockSceneFindUnique,
    },
  },
}))

const mockMirrorUrlToBlob = vi.fn()
vi.mock("@/lib/storage/client", () => ({
  mirrorUrlToBlob: mockMirrorUrlToBlob,
}))

const mockReplicatePredCreate = vi.fn()
vi.mock("@/lib/replicate/client", () => ({
  replicate: {
    predictions: { create: mockReplicatePredCreate },
  },
  MODELS: {
    latentSync: "bytedance/latentsync",
  },
}))

vi.mock("@/lib/webhooks/verify", () => ({
  verifyFalSecret: vi.fn().mockReturnValue(true),
}))

// next/server stubs — keep NextResponse shape minimal but usable
vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown) => ({ body }),
  },
}))

// ── Import handler after mocks ────────────────────────────────────────────────
const { POST } = await import("@/app/api/webhooks/fal/route")

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(body: object) {
  return { json: () => Promise.resolve(body) }
}

/** Default scene returned by findFirst */
function makeScene(overrides: Record<string, unknown> = {}) {
  return {
    id: "scene-1",
    videoPredictionId: "req-123",
    audioPredictionId: null,
    audioUrl: null,
    videoClipUrl: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  mockUpdateMany.mockResolvedValue({ count: 1 })
  mockFindFirst.mockResolvedValue(null)
  mockSceneUpdate.mockResolvedValue({})
  mockSceneFindUnique.mockResolvedValue(null)
  mockMirrorUrlToBlob.mockResolvedValue("https://blob.example.com/scenes/scene-1/clip.mp4")
  mockReplicatePredCreate.mockResolvedValue({ id: "lipsync-pred-1" })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/fal", () => {
  // ── happy paths ──────────────────────────────────────────────────────────

  it("video complete with no audio configured → sets videoClipUrl AND phase=done", async () => {
    const scene = makeScene({ audioPredictionId: null, audioUrl: null })
    mockFindFirst.mockResolvedValue(scene)
    const freshScene = { ...scene, videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4" }
    mockSceneFindUnique.mockResolvedValue(freshScene)

    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    // video URL stored
    expect(mockSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4" } })
    )
    // phase=done set (no audio needed)
    expect(mockSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { generationPhase: "done" } })
    )
  })

  it("video complete, audio pending → sets videoClipUrl but NOT phase=done", async () => {
    const scene = makeScene({ audioPredictionId: "aud-pred", audioUrl: null })
    mockFindFirst.mockResolvedValue(scene)
    const freshScene = { ...scene, videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4" }
    mockSceneFindUnique.mockResolvedValue(freshScene)

    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    // video URL stored
    expect(mockSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4" } })
    )
    // phase=done NOT set
    const doneCall = mockSceneUpdate.mock.calls.find(
      (args) => (args[0] as { data: Record<string, unknown> }).data?.generationPhase === "done"
    )
    expect(doneCall).toBeUndefined()
  })

  it("video complete, audio already done → claims lip sync via updateMany", async () => {
    const scene = makeScene({ audioPredictionId: "aud-pred", audioUrl: "https://blob.example.com/audio.wav" })
    mockFindFirst.mockResolvedValue(scene)
    const freshScene = { ...scene, videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4" }
    mockSceneFindUnique.mockResolvedValue(freshScene)
    mockUpdateMany.mockResolvedValue({ count: 1 })

    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    // lip sync claim via updateMany
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { generationPhase: "lipsync" } })
    )
  })

  // ── error / early-return paths ───────────────────────────────────────────

  it("ERROR status → updateMany to failed, no mirror attempted", async () => {
    await POST(makeReq({
      request_id: "req-123",
      status: "ERROR",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { generationPhase: "failed" } })
    )
    expect(mockMirrorUrlToBlob).not.toHaveBeenCalled()
  })

  it("error field present → updateMany to failed", async () => {
    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      error: "something blew up",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { generationPhase: "failed" } })
    )
    expect(mockMirrorUrlToBlob).not.toHaveBeenCalled()
  })

  it("missing request_id → returns early without any DB call", async () => {
    await POST(makeReq({
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    expect(mockUpdateMany).not.toHaveBeenCalled()
    expect(mockFindFirst).not.toHaveBeenCalled()
  })

  it("missing video URL in payload → returns early without mirror or DB write", async () => {
    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      payload: {},
    }) as never)

    expect(mockFindFirst).not.toHaveBeenCalled()
    expect(mockMirrorUrlToBlob).not.toHaveBeenCalled()
  })

  it("no matching scene for request_id → returns ok without error", async () => {
    mockFindFirst.mockResolvedValue(null)

    const result = await POST(makeReq({
      request_id: "req-xyz",
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    expect(result).toEqual({ body: { ok: true } })
    expect(mockMirrorUrlToBlob).not.toHaveBeenCalled()
    expect(mockSceneUpdate).not.toHaveBeenCalled()
  })

  // ── blob path ────────────────────────────────────────────────────────────

  it("mirrors to correct blob path scenes/{sceneId}/clip.mp4", async () => {
    const scene = makeScene({ id: "scene-42" })
    mockFindFirst.mockResolvedValue(scene)
    mockSceneFindUnique.mockResolvedValue({ ...scene, videoClipUrl: "https://blob.example.com/scenes/scene-42/clip.mp4", audioPredictionId: null })

    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    expect(mockMirrorUrlToBlob).toHaveBeenCalledWith(
      "https://fal.ai/video.mp4",
      "scenes/scene-42/clip.mp4"
    )
  })

  // ── error handling ───────────────────────────────────────────────────────

  it("mirrorUrlToBlob throws → updateMany to failed", async () => {
    const scene = makeScene()
    mockFindFirst.mockResolvedValue(scene)
    mockMirrorUrlToBlob.mockRejectedValue(new Error("blob write failed"))

    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { videoPredictionId: "req-123" },
        data: { generationPhase: "failed" },
      })
    )
  })
})
