import { describe, it, expect, vi, beforeEach } from "vitest"

const projectFindFirstMock = vi.fn()
const projectUpdateManyMock = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    scrapbookProject: {
      findFirst: (...args: unknown[]) => projectFindFirstMock(...args),
      updateMany: (...args: unknown[]) => projectUpdateManyMock(...args),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))
vi.mock("@/lib/auth/config", () => ({ authOptions: {} }))
vi.mock("next-auth", () => ({
  getServerSession: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}))
vi.mock("@/lib/scrapbook/assemble", () => ({
  assembleScrapbook: vi.fn().mockResolvedValue("https://blob/final.mp4"),
}))

import { POST } from "@/app/api/scrapbook/projects/[id]/stitch/route"

function makeParams(id: string) {
  return Promise.resolve({ id })
}

const donePages = Array.from({ length: 3 }, (_, i) => ({
  orderIndex: i,
  generationPhase: "done",
  rawClipUrl: `https://blob/clip-${i}.mp4`,
  beforeKeyframeUrl: null,
  sourcePhotoUrl: `https://blob/src-${i}.jpg`,
  caption: `Page ${i}`,
  qcResult: { passed: true },
  costUsd: 0.55,
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/scrapbook/projects/[id]/stitch", () => {
  it("returns 202 for a fresh project (status=done from prior run)", async () => {
    projectFindFirstMock.mockResolvedValue({
      id: "project-1",
      userId: "user-1",
      status: "done",
      stitchStartedAt: null,
      pages: donePages,
    })
    projectUpdateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("project-1") })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.status).toBe("generating")
    expect(body.reclaimedStale).toBe(false)
    // Timestamp is set on claim
    const call = projectUpdateManyMock.mock.calls[0][0]
    expect(call.data.stitchStartedAt).toBeInstanceOf(Date)
    expect(call.data.stitchFailureCode).toBeNull()
  })

  it("returns 409 when a fresh assembly is in-flight", async () => {
    projectFindFirstMock.mockResolvedValue({
      id: "project-1",
      userId: "user-1",
      status: "generating",
      stitchStartedAt: new Date(Date.now() - 2 * 60_000), // 2 min ago — fresh
      pages: donePages,
    })
    const res = await POST({} as never, { params: makeParams("project-1") })
    expect(res.status).toBe(409)
    expect(projectUpdateManyMock).not.toHaveBeenCalled()
  })

  it("reclaims a stale generating project (>10 min old)", async () => {
    projectFindFirstMock.mockResolvedValue({
      id: "project-1",
      userId: "user-1",
      status: "generating",
      stitchStartedAt: new Date(Date.now() - 20 * 60_000), // 20 min ago — stale
      pages: donePages,
    })
    projectUpdateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("project-1") })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.reclaimedStale).toBe(true)
  })

  it("reclaims a generating row with null stitchStartedAt (pre-migration state)", async () => {
    projectFindFirstMock.mockResolvedValue({
      id: "project-1",
      userId: "user-1",
      status: "generating",
      stitchStartedAt: null, // column added post-migration on an already-generating row
      pages: donePages,
    })
    projectUpdateManyMock.mockResolvedValue({ count: 1 })

    const res = await POST({} as never, { params: makeParams("project-1") })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.reclaimedStale).toBe(true)
  })

  it("returns 400 when pages are still generating", async () => {
    projectFindFirstMock.mockResolvedValue({
      id: "project-1",
      userId: "user-1",
      status: "draft",
      stitchStartedAt: null,
      pages: [
        ...donePages,
        { ...donePages[0], generationPhase: "vision", orderIndex: 3 },
      ],
    })
    const res = await POST({} as never, { params: makeParams("project-1") })
    expect(res.status).toBe(400)
  })

  it("returns 400 when project has zero pages", async () => {
    projectFindFirstMock.mockResolvedValue({
      id: "project-1",
      userId: "user-1",
      status: "draft",
      stitchStartedAt: null,
      pages: [],
    })
    const res = await POST({} as never, { params: makeParams("project-1") })
    expect(res.status).toBe(400)
  })

  it("returns 404 when project not found", async () => {
    projectFindFirstMock.mockResolvedValue(null)
    const res = await POST({} as never, { params: makeParams("nope") })
    expect(res.status).toBe(404)
  })

  it("returns 401 without auth", async () => {
    const nextAuth = await import("next-auth")
    ;(nextAuth.getServerSession as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)
    const res = await POST({} as never, { params: makeParams("project-1") })
    expect(res.status).toBe(401)
  })
})
