import { describe, it, expect, vi, beforeEach } from "vitest"

const findFirstMock = vi.fn()
const updateManyMock = vi.fn()
const updateMock = vi.fn()

const jobCreateMock = vi.fn().mockResolvedValue({ id: "job-1" })
const jobUpdateMock = vi.fn().mockResolvedValue({})
const jobDeleteMock = vi.fn().mockResolvedValue({})

vi.mock("@/lib/db/client", () => ({
  prisma: {
    spendLedger: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { estimatedCostUsd: 0 } }),
      create: vi.fn().mockResolvedValue({}),
    },
    character: {
      findFirst: (...args: unknown[]) => findFirstMock(...args),
      updateMany: (...args: unknown[]) => updateManyMock(...args),
      update: (...args: unknown[]) => updateMock(...args),
    },
    job: {
      create: (...args: unknown[]) => jobCreateMock(...args),
      update: (...args: unknown[]) => jobUpdateMock(...args),
      delete: (...args: unknown[]) => jobDeleteMock(...args),
    },
  },
}))
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }))
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user-1", role: "FREE" } }),
}))
vi.mock("@/lib/limits", () => ({
  checkTrainingLimit: vi.fn().mockResolvedValue({ allowed: true }),
}))
const submitMock = vi.fn().mockResolvedValue({ request_id: "fal-req-1" })
vi.mock("@/lib/fal/client", () => ({
  fal: {
    queue: { submit: (...args: unknown[]) => submitMock(...args) },
  },
  FAL_MODELS: { loraTraining: "fal-ai/flux-lora-fast-training" },
}))
vi.mock("@/lib/replicate/client", () => ({
  characterTriggerWord: (id: string) => `char_${id.slice(0, 6)}`,
}))
const buildZipMock = vi.fn().mockResolvedValue("https://blob/training.zip")
vi.mock("@/lib/training/retrain", () => ({
  buildAndUploadZip: (...args: unknown[]) => buildZipMock(...args),
}))
vi.mock("@/lib/logger", () => ({ logError: vi.fn() }))

import { POST } from "@/app/api/characters/[id]/train/route"

function makeParams(id: string) {
  return Promise.resolve({ id })
}

const baseCharacter = {
  id: "char-1",
  userId: "user-1",
  selectedStyleUrl: "https://blob/style.jpg",
  sourcePhotoUrl: "https://blob/source.jpg",
  trainingImages: Array.from({ length: 35 }, (_, i) => `https://blob/aug-${i}.jpg`),
  loraTrainingStatus: null as string | null,
  trainStartedAt: null as Date | null,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/characters/[id]/train — optimistic lock (paid-work dup prevention)", () => {
  it("returns 202-ish (200 with job_id) and claims a fresh row", async () => {
    findFirstMock.mockResolvedValue({ ...baseCharacter })
    updateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.job_id).toBe("job-1")
    expect(body.reclaimedStale).toBe(false)
    expect(updateManyMock).toHaveBeenCalledOnce()
    expect(submitMock).toHaveBeenCalledOnce()
    // Timestamp set on claim
    const call = updateManyMock.mock.calls[0][0]
    expect(call.data.trainStartedAt).toBeInstanceOf(Date)
    expect(call.data.loraTrainingStatus).toBe("processing")
    // Failure metadata cleared
    expect(call.data.trainFailureCode).toBeNull()
  })

  it("returns 409 when a fresh training is in-flight (prevents paid duplicate)", async () => {
    findFirstMock.mockResolvedValue({
      ...baseCharacter,
      loraTrainingStatus: "processing",
      trainStartedAt: new Date(Date.now() - 5 * 60_000), // 5 min ago — fresh
    })
    updateManyMock.mockResolvedValue({ count: 0 })

    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(409)
    // fal.queue.submit must NOT have fired — the whole point of the lock.
    expect(submitMock).not.toHaveBeenCalled()
    // buildAndUploadZip must NOT have fired — that's also paid infra bandwidth.
    expect(buildZipMock).not.toHaveBeenCalled()
  })

  it("reclaims a STALE processing row (>30min)", async () => {
    findFirstMock.mockResolvedValue({
      ...baseCharacter,
      loraTrainingStatus: "processing",
      trainStartedAt: new Date(Date.now() - 45 * 60_000), // 45 min ago
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.reclaimedStale).toBe(true)
    expect(submitMock).toHaveBeenCalledOnce()
  })

  it("reclaims a previously-failed character", async () => {
    findFirstMock.mockResolvedValue({
      ...baseCharacter,
      loraTrainingStatus: "failed",
      trainStartedAt: new Date(Date.now() - 5 * 60_000),
    })
    updateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(200)
  })

  it("releases the lock on zip-build failure (allows retry)", async () => {
    findFirstMock.mockResolvedValue({ ...baseCharacter })
    updateManyMock.mockResolvedValue({ count: 1 })
    buildZipMock.mockRejectedValueOnce(new Error("blob upload failed"))
    updateMock.mockResolvedValue({})

    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(500)
    // updateMock called with status=failed to release the lock
    const releaseCall = updateMock.mock.calls.find((c) => c[0]?.data?.loraTrainingStatus === "failed")
    expect(releaseCall).toBeDefined()
    expect(releaseCall![0].data.trainStartedAt).toBeNull()
  })

  it("releases the lock on fal.queue.submit failure", async () => {
    findFirstMock.mockResolvedValue({ ...baseCharacter })
    updateManyMock.mockResolvedValue({ count: 1 })
    buildZipMock.mockResolvedValue("https://blob/training.zip")
    submitMock.mockRejectedValueOnce(new Error("provider down"))
    updateMock.mockResolvedValue({})

    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(502)
    const releaseCall = updateMock.mock.calls.find((c) => c[0]?.data?.loraTrainingStatus === "failed")
    expect(releaseCall).toBeDefined()
  })

  it("returns 429 on training-limit exceeded (before touching fal)", async () => {
    findFirstMock.mockResolvedValue({ ...baseCharacter })
    const limits = await import("@/lib/limits")
    ;(limits.checkTrainingLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      allowed: false,
      used: 3,
      limit: 3,
      resetsAt: new Date(Date.now() + 3600_000).toISOString(),
    })
    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(429)
    expect(submitMock).not.toHaveBeenCalled()
  })

  it("returns 404 when character not owned by user", async () => {
    findFirstMock.mockResolvedValue(null)
    const res = await POST({} as never, { params: makeParams("nope") })
    expect(res.status).toBe(404)
  })

  it("returns 401 without auth", async () => {
    const nextAuth = await import("next-auth")
    ;(nextAuth.getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(401)
  })

  it("releases lock and does NOT touch fal when Job.create fails", async () => {
    findFirstMock.mockResolvedValue({ ...baseCharacter })
    updateManyMock.mockResolvedValue({ count: 1 })
    buildZipMock.mockResolvedValue("https://blob/training.zip")
    jobCreateMock.mockRejectedValueOnce(new Error("DB unavailable"))
    updateMock.mockResolvedValue({})

    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(500)
    // Critical: fal was NEVER called — no paid work orphaned
    expect(submitMock).not.toHaveBeenCalled()
    // Character lock released
    const releaseCall = updateMock.mock.calls.find((c) => c[0]?.data?.loraTrainingStatus === "failed")
    expect(releaseCall).toBeDefined()
    expect(releaseCall![0].data.trainStartedAt).toBeNull()
    expect(releaseCall![0].data.trainFailureCode).toBe("internal")
  })

  it("deletes the placeholder Job AND releases lock when fal submit fails", async () => {
    findFirstMock.mockResolvedValue({ ...baseCharacter })
    updateManyMock.mockResolvedValue({ count: 1 })
    buildZipMock.mockResolvedValue("https://blob/training.zip")
    jobCreateMock.mockResolvedValueOnce({ id: "placeholder-job-1" })
    submitMock.mockRejectedValueOnce(new Error("fal API down"))
    updateMock.mockResolvedValue({})

    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(502)
    // Placeholder Job deleted so we don't have an orphan "processing" row
    expect(jobDeleteMock).toHaveBeenCalledWith({ where: { id: "placeholder-job-1" } })
    // Character lock released
    const releaseCall = updateMock.mock.calls.find((c) => c[0]?.data?.loraTrainingStatus === "failed")
    expect(releaseCall).toBeDefined()
  })

  it("updates Job with real fal request_id after successful submit", async () => {
    findFirstMock.mockResolvedValue({ ...baseCharacter })
    updateManyMock.mockResolvedValue({ count: 1 })
    buildZipMock.mockResolvedValue("https://blob/training.zip")
    jobCreateMock.mockResolvedValueOnce({ id: "job-abc" })
    submitMock.mockResolvedValueOnce({ request_id: "fal-real-req-42" })

    const res = await POST({} as never, { params: makeParams("char-1") })
    expect(res.status).toBe(200)
    // Job updated with fal's real request_id (webhook correlation)
    expect(jobUpdateMock).toHaveBeenCalledWith({
      where: { id: "job-abc" },
      data: { replicatePredictionId: "fal-real-req-42" },
    })
  })

  it("still returns success if Job.update fails after fal accepts (paid work already running)", async () => {
    findFirstMock.mockResolvedValue({ ...baseCharacter })
    updateManyMock.mockResolvedValue({ count: 1 })
    buildZipMock.mockResolvedValue("https://blob/training.zip")
    jobCreateMock.mockResolvedValueOnce({ id: "job-def" })
    submitMock.mockResolvedValueOnce({ request_id: "fal-req-99" })
    jobUpdateMock.mockRejectedValueOnce(new Error("DB flaked"))

    const res = await POST({} as never, { params: makeParams("char-1") })
    // Don't fail the user — fal is already running paid work; stale-recovery
    // will cover any orphaned state. But we should have logged loudly.
    expect(res.status).toBe(200)
  })
})
