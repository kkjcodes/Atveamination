import { describe, it, expect, vi, beforeEach } from "vitest"

const findUniqueMock = vi.fn()
const createMock = vi.fn()

vi.mock("@/lib/db/client", () => ({
  prisma: {
    user: {
      findUnique: (...args: unknown[]) => findUniqueMock(...args),
      create: (...args: unknown[]) => createMock(...args),
    },
  },
}))

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn().mockReturnValue({ allowed: true, retryAfterMs: 0 }),
}))

vi.mock("bcryptjs", () => ({
  default: {
    hash: vi.fn().mockResolvedValue("hashed_pw"),
  },
}))

import { POST } from "@/app/api/auth/register/route"

function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "1.2.3.4" },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  findUniqueMock.mockResolvedValue(null)
  createMock.mockResolvedValue({ id: "user-1", email: "user@example.com", name: "Test" })
})

describe("POST /api/auth/register — segment persistence", () => {
  it("maps client 'personal' to DB enum 'family'", async () => {
    const res = await POST(makeRequest({
      email: "a@b.com",
      password: "12345678",
      name: "Test",
      segment: "personal",
    }) as never)
    expect(res.status).toBe(201)
    const call = createMock.mock.calls[0][0]
    expect(call.data.segment).toBe("family")
    expect(call.data.segmentPickedAt).toBeInstanceOf(Date)
  })

  it("accepts 'business' verbatim and persists with timestamp", async () => {
    const res = await POST(makeRequest({
      email: "a@b.com",
      password: "12345678",
      name: "Test",
      segment: "business",
    }) as never)
    expect(res.status).toBe(201)
    const call = createMock.mock.calls[0][0]
    expect(call.data.segment).toBe("business")
    expect(call.data.segmentPickedAt).toBeInstanceOf(Date)
  })

  it("also accepts 'family' verbatim (backward-compat with existing segment API)", async () => {
    const res = await POST(makeRequest({
      email: "a@b.com",
      password: "12345678",
      name: "Test",
      segment: "family",
    }) as never)
    expect(res.status).toBe(201)
    const call = createMock.mock.calls[0][0]
    expect(call.data.segment).toBe("family")
  })

  it("silently drops an invalid segment (no error, no field written)", async () => {
    // Invalid segment shouldn't 400 — the value is optional analytics
    // metadata, not a required field. Just don't stamp anything.
    const res = await POST(makeRequest({
      email: "a@b.com",
      password: "12345678",
      name: "Test",
      segment: "chef",
    }) as never)
    expect(res.status).toBe(201)
    const call = createMock.mock.calls[0][0]
    expect(call.data.segment).toBeUndefined()
    expect(call.data.segmentPickedAt).toBeUndefined()
  })

  it("omits segment field entirely when not provided", async () => {
    const res = await POST(makeRequest({
      email: "a@b.com",
      password: "12345678",
      name: "Test",
    }) as never)
    expect(res.status).toBe(201)
    const call = createMock.mock.calls[0][0]
    expect(call.data.segment).toBeUndefined()
    expect(call.data.segmentPickedAt).toBeUndefined()
  })

  it("still rejects when email already exists (segment doesn't bypass 409)", async () => {
    findUniqueMock.mockResolvedValue({ id: "existing" })
    const res = await POST(makeRequest({
      email: "a@b.com",
      password: "12345678",
      segment: "business",
    }) as never)
    expect(res.status).toBe(409)
    expect(createMock).not.toHaveBeenCalled()
  })
})
