import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// ── Mocks (declared before importing the module under test) ───────────────────

const mockSceneUpdateMany = vi.fn()
const mockSceneUpdate = vi.fn()
const mockSceneFindFirst = vi.fn()
const mockSceneFindUnique = vi.fn()
const mockCharFindUnique = vi.fn()
const mockVoiceFindUnique = vi.fn()
const mockVoiceFindFirst = vi.fn()
const mockTransaction = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scene: {
      updateMany: mockSceneUpdateMany,
      update: mockSceneUpdate,
      findFirst: mockSceneFindFirst,
      findUnique: mockSceneFindUnique,
    },
    character: {
      findUnique: mockCharFindUnique,
    },
    voice: {
      findUnique: mockVoiceFindUnique,
      findFirst: mockVoiceFindFirst,
    },
    $transaction: mockTransaction,
  },
}))

const mockFalQueueSubmit = vi.fn()
vi.mock("@/lib/fal/client", () => ({
  fal: {
    queue: {
      submit: mockFalQueueSubmit,
    },
  },
  FAL_MODELS: { wan: "fal-ai/wan-i2v" },
}))

const mockReplicatePredCreate = vi.fn()
vi.mock("@/lib/replicate/client", () => ({
  replicate: {
    predictions: { create: mockReplicatePredCreate },
  },
  MODELS: {
    xttsV2: "lucataco/xtts-v2:abc123",
    fluxKontextPro: "black-forest-labs/flux-kontext-pro",
    fluxDev: "black-forest-labs/flux-dev",
    wan: "wavespeedai/wan-2.1-i2v-480p",
    fluxLoraTrainer: "ostris/flux-dev-lora-trainer",
    whisper: "openai/whisper",
    ffmpegConcat: "andreasjansson/ffmpeg",
  },
  STYLE_HINTS: {
    default: { image: "2D animated cartoon", video: "2D cartoon animation" },
    pixar: { image: "Disney Pixar 3D animated", video: "Pixar 3D animated cartoon" },
  },
  characterTriggerWord: (id: string) => `CHAR${id.toUpperCase().slice(0, 8)}`,
}))

const mockMirrorUrlToBlob = vi.fn()
vi.mock("@/lib/storage/client", () => ({
  mirrorUrlToBlob: mockMirrorUrlToBlob,
}))

const mockSanitizeVideoPrompt = vi.fn()
vi.mock("@/lib/ai/moderation", () => ({
  sanitizeVideoPrompt: mockSanitizeVideoPrompt,
  moderatePrompt: vi.fn(),
}))

vi.mock("@/lib/ai/describe", () => ({
  describeCharacter: vi.fn().mockResolvedValue(null),
  describeFirstFrame: vi.fn().mockResolvedValue(null),
}))

vi.mock("@/lib/webhooks/verify", () => ({
  verifyReplicateSignature: vi.fn().mockReturnValue(true),
}))

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown) => ({ body }),
  },
}))

// ── Import handler after mocks ────────────────────────────────────────────────
const { POST } = await import("@/app/api/webhooks/replicate/route")

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeReq(body: object) {
  const json = JSON.stringify(body)
  return {
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(json),
    headers: new Headers({ "webhook-id": "id", "webhook-timestamp": "999999999999", "webhook-signature": "v1,dummysig" }),
  }
}

function makeImageScene(overrides: Record<string, unknown> = {}) {
  return {
    id: "scene-1",
    imagePredictionId: "pred-img-1",
    generationPhase: "image",
    videoPredictionId: null,
    audioPredictionId: null,
    imageUrl: null,
    description: "A character walks through a forest",
    voiceScript: "Hello there!",
    orderIndex: 1,
    projectId: "proj-1",
    project: {
      characterId: "char-1",
      voiceId: "voice-1",
      // Project characters relation (used by speaker inference fallback)
      characters: [],
    },
    ...overrides,
  }
}

function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    id: "char-1",
    selectedStyle: "default",
    characterDescription: "A brave cartoon hero",
    loraVersion: null,
    loraTrainingStatus: null,
    selectedStyleUrl: null,
    ...overrides,
  }
}

function makeVoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "voice-1",
    sampleAudioUrl: "https://example.com/sample.wav",
    ...overrides,
  }
}

/** Wire mockTransaction to call callback with a tx wrapping freshScene */
function setupTransaction(freshScene: Record<string, unknown> | null) {
  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const txScene = {
      update: vi.fn().mockResolvedValue({}),
      findUnique: vi.fn().mockResolvedValue(freshScene),
    }
    return fn({ scene: txScene })
  })
}

// ── Per-test defaults ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  // Default: no scene found
  mockSceneFindFirst.mockResolvedValue(null)
  mockSceneFindUnique.mockResolvedValue(null)
  mockSceneUpdateMany.mockResolvedValue({ count: 1 })
  mockSceneUpdate.mockResolvedValue({})

  // Default character & voice
  mockCharFindUnique.mockResolvedValue(makeCharacter())
  mockVoiceFindUnique.mockResolvedValue(makeVoice())
  // Per-character voice lookup (focusCharacter has its own voice). Default to
  // null so the existing tests fall back to project.voiceId (unchanged behavior).
  mockVoiceFindFirst.mockResolvedValue(null)

  // fal.queue.submit returns a request_id
  mockFalQueueSubmit.mockResolvedValue({ request_id: "fal-req-1" })

  // replicate predictions create returns an id
  mockReplicatePredCreate.mockResolvedValue({ id: "aud-pred-1" })

  // mirrorUrlToBlob returns a blob URL
  mockMirrorUrlToBlob.mockResolvedValue("https://blob.example.com/scenes/scene-1/frame.jpg")

  // sanitizeVideoPrompt echoes input
  mockSanitizeVideoPrompt.mockImplementation((p: string) => Promise.resolve(p))

  // global fetch (toDataUri) — for voice sample
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    headers: { get: () => "audio/webm" },
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
  }))

  // Default: no NEXT_PUBLIC_APP_URL (simulates local dev)
  delete process.env.NEXT_PUBLIC_APP_URL
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  delete process.env.NEXT_PUBLIC_APP_URL
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/replicate — image completion", () => {
  it("happy path with voice → sets imageUrl, videoPredictionId, audioPredictionId, phase=video", async () => {
    const scene = makeImageScene()
    mockSceneFindFirst.mockResolvedValue(scene)

    await POST(makeReq({
      id: "pred-img-1",
      status: "succeeded",
      output: "https://replicate.delivery/frame.jpg",
    }) as never)

    expect(mockSceneUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "scene-1", generationPhase: "image", videoPredictionId: null },
        data: expect.objectContaining({
          imageUrl: expect.any(String),
          generationPhase: "video",
          videoPredictionId: "fal-req-1",
          audioPredictionId: "aud-pred-1",
        }),
      })
    )
  })

  it("happy path without voice → audioPredictionId=null", async () => {
    const scene = makeImageScene({ project: { characterId: "char-1", voiceId: null, characters: [] } })
    mockSceneFindFirst.mockResolvedValue(scene)

    await POST(makeReq({
      id: "pred-img-1",
      status: "succeeded",
      output: "https://replicate.delivery/frame.jpg",
    }) as never)

    expect(mockSceneUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          audioPredictionId: null,
        }),
      })
    )
    expect(mockReplicatePredCreate).not.toHaveBeenCalled()
  })

  it("output as array → uses first element as keyframe URL", async () => {
    const scene = makeImageScene()
    mockSceneFindFirst.mockResolvedValue(scene)

    await POST(makeReq({
      id: "pred-img-1",
      status: "succeeded",
      output: ["https://replicate.delivery/frame-0.jpg", "https://replicate.delivery/frame-1.jpg"],
    }) as never)

    expect(mockMirrorUrlToBlob).toHaveBeenCalledWith(
      "https://replicate.delivery/frame-0.jpg",
      "scenes/scene-1/frame.jpg"
    )
  })

  it("no character found → marks phase=failed, no fal submit", async () => {
    const scene = makeImageScene()
    mockSceneFindFirst.mockResolvedValue(scene)
    mockCharFindUnique.mockResolvedValue(null)

    await POST(makeReq({
      id: "pred-img-1",
      status: "succeeded",
      output: "https://replicate.delivery/frame.jpg",
    }) as never)

    expect(mockSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { generationPhase: "failed" } })
    )
    expect(mockFalQueueSubmit).not.toHaveBeenCalled()
  })

  it("optimistic lock race (updateMany count=0) → no error thrown", async () => {
    const scene = makeImageScene()
    mockSceneFindFirst.mockResolvedValue(scene)
    mockSceneUpdateMany.mockResolvedValue({ count: 0 })

    await expect(
      POST(makeReq({
        id: "pred-img-1",
        status: "succeeded",
        output: "https://replicate.delivery/frame.jpg",
      }) as never)
    ).resolves.toBeDefined()
  })

  it("includes fal webhookUrl in prod, omits it for localhost", async () => {
    // prod — WEBHOOK_SECRET must also be set for the URL to be injected
    process.env.NEXT_PUBLIC_APP_URL = "https://prod.example.com"
    process.env.WEBHOOK_SECRET = "test-secret"
    const scene = makeImageScene()
    mockSceneFindFirst.mockResolvedValue(scene)

    await POST(makeReq({
      id: "pred-img-1",
      status: "succeeded",
      output: "https://replicate.delivery/frame.jpg",
    }) as never)

    expect(mockFalQueueSubmit).toHaveBeenCalledWith(
      "fal-ai/wan-i2v",
      expect.objectContaining({ webhookUrl: "https://prod.example.com/api/webhooks/fal?secret=test-secret" })
    )

    vi.clearAllMocks()
    mockSceneFindFirst.mockResolvedValue(scene)
    mockFalQueueSubmit.mockResolvedValue({ request_id: "fal-req-2" })
    mockMirrorUrlToBlob.mockResolvedValue("https://blob.example.com/scenes/scene-1/frame.jpg")
    mockSanitizeVideoPrompt.mockImplementation((p: string) => Promise.resolve(p))
    mockCharFindUnique.mockResolvedValue(makeCharacter())
    mockVoiceFindUnique.mockResolvedValue(makeVoice())
    mockReplicatePredCreate.mockResolvedValue({ id: "aud-pred-2" })
    mockSceneUpdateMany.mockResolvedValue({ count: 1 })
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      headers: { get: () => "audio/webm" },
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)),
    }))

    // localhost
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000"
    await POST(makeReq({
      id: "pred-img-1",
      status: "succeeded",
      output: "https://replicate.delivery/frame.jpg",
    }) as never)

    const submitCall = mockFalQueueSubmit.mock.calls[0][1] as Record<string, unknown>
    expect(submitCall).not.toHaveProperty("webhookUrl")
  })

  it("audio prediction error is caught, scene still transitions to video phase", async () => {
    const scene = makeImageScene()
    mockSceneFindFirst.mockResolvedValue(scene)
    mockReplicatePredCreate.mockRejectedValue(new Error("replicate blew up"))

    await POST(makeReq({
      id: "pred-img-1",
      status: "succeeded",
      output: "https://replicate.delivery/frame.jpg",
    }) as never)

    // scene should still transition
    expect(mockSceneUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          generationPhase: "video",
          audioPredictionId: null, // audio failed, so null
        }),
      })
    )
  })

  it("failed status → marks image scene failed via updateMany", async () => {
    await POST(makeReq({
      id: "pred-img-1",
      status: "failed",
      output: null,
    }) as never)

    expect(mockSceneUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { imagePredictionId: "pred-img-1", generationPhase: "image" },
        data: { generationPhase: "failed" },
      })
    )
  })

  it("canceled status → marks image scene failed via updateMany", async () => {
    await POST(makeReq({
      id: "pred-img-1",
      status: "canceled",
      output: null,
    }) as never)

    expect(mockSceneUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { imagePredictionId: "pred-img-1", generationPhase: "image" },
        data: { generationPhase: "failed" },
      })
    )
  })

  it("status !== succeeded → returns early, no DB scene lookup", async () => {
    await POST(makeReq({
      id: "pred-img-1",
      status: "starting",
      output: "something",
    }) as never)

    expect(mockSceneFindFirst).not.toHaveBeenCalled()
    expect(mockSceneUpdateMany).not.toHaveBeenCalled()
  })

  it("no output (succeeded but output falsy) → returns early", async () => {
    await POST(makeReq({
      id: "pred-img-1",
      status: "succeeded",
      output: null,
    }) as never)

    expect(mockSceneFindFirst).not.toHaveBeenCalled()
  })

  it("no matching scene for either image or audio prediction → returns {ok:true} without error", async () => {
    mockSceneFindFirst.mockResolvedValue(null)

    const result = await POST(makeReq({
      id: "pred-unknown",
      status: "succeeded",
      output: "https://replicate.delivery/frame.jpg",
    }) as never)

    expect(result).toEqual({ body: { ok: true } })
    expect(mockSceneUpdateMany).not.toHaveBeenCalled()
    expect(mockFalQueueSubmit).not.toHaveBeenCalled()
  })
})

describe("POST /api/webhooks/replicate — audio completion", () => {
  // Route calls findFirst 3 times: image lookup, lipsync lookup, audio lookup.
  // Audio tests need null for first two, then the audioScene for the third.

  function setupAudioScene(audioSceneOverrides: Record<string, unknown> = {}) {
    const audioScene = {
      id: "scene-1",
      audioPredictionId: "pred-aud-1",
      videoClipUrl: null,
      audioUrl: null,
      ...audioSceneOverrides,
    }
    mockSceneFindFirst
      .mockResolvedValueOnce(null)   // image lookup
      .mockResolvedValueOnce(null)   // lip sync lookup
      .mockResolvedValueOnce(audioScene)  // audio lookup

    return audioScene
  }

  it("audio complete, video already ready → claims lip sync via updateMany", async () => {
    setupAudioScene({ videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4" })
    mockMirrorUrlToBlob.mockResolvedValue("https://blob.example.com/scenes/scene-1/audio.wav")
    mockSceneFindUnique.mockResolvedValue({
      id: "scene-1",
      audioUrl: "https://blob.example.com/scenes/scene-1/audio.wav",
      videoClipUrl: "https://blob.example.com/scenes/scene-1/clip.mp4",
    })
    mockSceneUpdateMany.mockResolvedValue({ count: 1 })

    await POST(makeReq({
      id: "pred-aud-1",
      status: "succeeded",
      output: "https://replicate.delivery/audio.wav",
    }) as never)

    // Audio URL stored via direct update (no transaction)
    expect(mockSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { audioUrl: "https://blob.example.com/scenes/scene-1/audio.wav" } })
    )
    // Lip sync claimed via updateMany
    expect(mockSceneUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { generationPhase: "lipsync" } })
    )
  })

  it("audio complete, video NOT ready → stores audio only, no lip sync", async () => {
    setupAudioScene({ videoClipUrl: null })
    mockMirrorUrlToBlob.mockResolvedValue("https://blob.example.com/scenes/scene-1/audio.wav")
    mockSceneFindUnique.mockResolvedValue({
      id: "scene-1",
      audioUrl: "https://blob.example.com/scenes/scene-1/audio.wav",
      videoClipUrl: null,
    })

    await POST(makeReq({
      id: "pred-aud-1",
      status: "succeeded",
      output: "https://replicate.delivery/audio.wav",
    }) as never)

    // Audio stored
    expect(mockSceneUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { audioUrl: "https://blob.example.com/scenes/scene-1/audio.wav" } })
    )
    // No lip sync claimed
    const lipSyncCall = mockSceneUpdateMany.mock.calls.find(
      (args) => (args[0] as { data: Record<string, unknown> }).data?.generationPhase === "lipsync"
    )
    expect(lipSyncCall).toBeUndefined()
  })

  it("mirrors audio to correct blob path", async () => {
    const audioScene = {
      id: "scene-99",
      audioPredictionId: "pred-aud-1",
      videoClipUrl: null,
      audioUrl: null,
    }
    mockSceneFindFirst
      .mockResolvedValueOnce(null)   // image lookup
      .mockResolvedValueOnce(null)   // lip sync lookup
      .mockResolvedValueOnce(audioScene)  // audio lookup
    mockMirrorUrlToBlob.mockResolvedValue("https://blob.example.com/scenes/scene-99/audio.wav")
    mockSceneFindUnique.mockResolvedValue({ ...audioScene, audioUrl: "https://blob.example.com/scenes/scene-99/audio.wav", videoClipUrl: null })

    await POST(makeReq({
      id: "pred-aud-1",
      status: "succeeded",
      output: "https://replicate.delivery/audio.wav",
    }) as never)

    expect(mockMirrorUrlToBlob).toHaveBeenCalledWith(
      "https://replicate.delivery/audio.wav",
      "scenes/scene-99/audio.wav"
    )
  })
})
