import { describe, it, expect, vi, beforeEach } from "vitest"

const mockUserFindUnique = vi.fn()
const mockUserUpdate = vi.fn()
const mockGetServerSession = vi.fn()
const mockEmit = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique, update: mockUserUpdate },
  },
}))

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}))

vi.mock("@/lib/auth/config", () => ({
  authOptions: {},
}))

vi.mock("@/lib/events", () => ({
  emit: mockEmit,
}))

vi.mock("next/server", () => ({
  NextRequest: class {},
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}))

const { POST } = await import("@/app/api/segment/route")

function makeReq(body: unknown) {
  return { json: async () => body }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUserUpdate.mockResolvedValue({})
})

describe("POST /api/segment — segment merge logic (resumability across doors)", () => {
  it("rejects unknown segment values (guard against tampering)", async () => {
    const res = await POST(makeReq({ segment: "malicious" }) as never)
    expect(res.status).toBe(400)
  })

  it("no-ops persistence for anonymous users but always emits event", async () => {
    mockGetServerSession.mockResolvedValue(null)
    const res = await POST(makeReq({ segment: "business" }) as never)
    expect(res.body).toEqual({ ok: true, persisted: false })
    expect(mockUserUpdate).not.toHaveBeenCalled()
    expect(mockEmit).toHaveBeenCalledWith("flow_entered", { door: "business" }, null)
  })

  it("sets segment=business on first-time pick", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
    mockUserFindUnique.mockResolvedValue({ segment: null, segmentPickedAt: null })
    await POST(makeReq({ segment: "business" }) as never)
    const call = mockUserUpdate.mock.calls[0][0]
    expect(call.data.segment).toBe("business")
    expect(call.data.segmentPickedAt).toBeInstanceOf(Date)
  })

  it("preserves original pick timestamp on subsequent picks (both-user retains history)", async () => {
    const original = new Date("2026-01-01T00:00:00Z")
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
    mockUserFindUnique.mockResolvedValue({ segment: "family", segmentPickedAt: original })
    await POST(makeReq({ segment: "business" }) as never)
    const call = mockUserUpdate.mock.calls[0][0]
    expect(call.data.segmentPickedAt).toBe(original)
  })

  it("family → business upgrades to 'both' (never overwrites)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
    mockUserFindUnique.mockResolvedValue({ segment: "family", segmentPickedAt: new Date() })
    await POST(makeReq({ segment: "business" }) as never)
    const call = mockUserUpdate.mock.calls[0][0]
    expect(call.data.segment).toBe("both")
  })

  it("business → family also upgrades to 'both' (symmetry)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
    mockUserFindUnique.mockResolvedValue({ segment: "business", segmentPickedAt: new Date() })
    await POST(makeReq({ segment: "family" }) as never)
    const call = mockUserUpdate.mock.calls[0][0]
    expect(call.data.segment).toBe("both")
  })

  it("re-clicking the same door is a no-op (segment stays the same)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
    mockUserFindUnique.mockResolvedValue({ segment: "family", segmentPickedAt: new Date() })
    await POST(makeReq({ segment: "family" }) as never)
    const call = mockUserUpdate.mock.calls[0][0]
    expect(call.data.segment).toBe("family")
  })

  it("'both' segment stays 'both' regardless of subsequent picks (no downgrade)", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
    mockUserFindUnique.mockResolvedValue({ segment: "both", segmentPickedAt: new Date() })
    await POST(makeReq({ segment: "family" }) as never)
    const call = mockUserUpdate.mock.calls[0][0]
    expect(call.data.segment).toBe("both")
  })

  it("returns 400 for missing segment", async () => {
    const res = await POST(makeReq({}) as never)
    expect(res.status).toBe(400)
  })

  it("emits flow_entered even for authenticated users", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "u1" } })
    mockUserFindUnique.mockResolvedValue({ segment: null, segmentPickedAt: null })
    await POST(makeReq({ segment: "business" }) as never)
    expect(mockEmit).toHaveBeenCalledWith("flow_entered", { door: "business" }, "u1")
  })
})
