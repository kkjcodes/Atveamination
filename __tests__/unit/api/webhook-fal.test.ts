import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks (must be declared before any import of the module under test) ───────

const mockUpdateMany = vi.fn()
const mockFindFirst = vi.fn()
const mockTransaction = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scene: {
      updateMany: mockUpdateMany,
      findFirst: mockFindFirst,
    },
    $transaction: mockTransaction,
  },
}))

const mockMirrorUrlToBlob = vi.fn()
vi.mock("@/lib/storage/client", () => ({
  mirrorUrlToBlob: mockMirrorUrlToBlob,
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

/**
 * Wire mockTransaction so it invokes the callback with a tx that wraps
 * the provided freshScene state.
 */
function setupTransaction(freshScene: Record<string, unknown> | null) {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const txScene = {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(freshScene),
    }
    return fn({ scene: txScene })
  })
}

beforeEach(() => {
  vi.clearAllMocks()

  mockUpdateMany.mockResolvedValue({ count: 1 })
  mockFindFirst.mockResolvedValue(null)
  mockMirrorUrlToBlob.mockResolvedValue("https://blob.example.com/scenes/scene-1/clip.mp4")
  setupTransaction(makeScene({ videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4" }))
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
    setupTransaction(freshScene)

    let txSceneRef: { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> } | null = null
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      txSceneRef = {
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(freshScene),
      }
      return fn({ scene: txSceneRef })
    })

    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    // transaction ran
    expect(mockTransaction).toHaveBeenCalledOnce()
    // phase=done was set
    expect(txSceneRef!.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { generationPhase: "done" } })
    )
  })

  it("video complete, audio pending → sets videoClipUrl but NOT phase=done", async () => {
    const scene = makeScene({ audioPredictionId: "aud-pred", audioUrl: null })
    mockFindFirst.mockResolvedValue(scene)
    const freshScene = {
      ...scene,
      videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4",
    }

    let txSceneRef: { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> } | null = null
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      txSceneRef = {
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(freshScene),
      }
      return fn({ scene: txSceneRef })
    })

    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    expect(mockTransaction).toHaveBeenCalledOnce()
    // The only update call should be for videoClipUrl, not generationPhase=done
    const doneCall = txSceneRef!.update.mock.calls.find(
      (args) => (args[0] as { data: Record<string, unknown> }).data?.generationPhase === "done"
    )
    expect(doneCall).toBeUndefined()
  })

  it("video complete, audio already done → sets videoClipUrl AND phase=done", async () => {
    const scene = makeScene({ audioPredictionId: "aud-pred", audioUrl: "https://blob.example.com/audio.wav" })
    mockFindFirst.mockResolvedValue(scene)
    const freshScene = {
      ...scene,
      videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4",
    }

    let txSceneRef: { update: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> } | null = null
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      txSceneRef = {
        update: vi.fn().mockResolvedValue({}),
        findUnique: vi.fn().mockResolvedValue(freshScene),
      }
      return fn({ scene: txSceneRef })
    })

    await POST(makeReq({
      request_id: "req-123",
      status: "OK",
      payload: { video: { url: "https://fal.ai/video.mp4" } },
    }) as never)

    expect(txSceneRef!.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { generationPhase: "done" } })
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
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  // ── blob path ────────────────────────────────────────────────────────────

  it("mirrors to correct blob path scenes/{sceneId}/clip.mp4", async () => {
    const scene = makeScene({ id: "scene-42" })
    mockFindFirst.mockResolvedValue(scene)
    setupTransaction({ ...scene, videoClipUrl: "https://blob.example.com/scenes/scene-42/clip.mp4", audioPredictionId: null })

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
