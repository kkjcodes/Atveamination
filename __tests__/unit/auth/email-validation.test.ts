import { describe, it, expect, vi, beforeEach } from "vitest"

const mockResolveMx = vi.fn()
vi.mock("dns", () => {
  const mod = { promises: { resolveMx: (...a: unknown[]) => mockResolveMx(...a) } }
  return { ...mod, default: mod }
})

const { validateEmailDomain } = await import("@/lib/auth/email-validation")

beforeEach(() => vi.clearAllMocks())

describe("validateEmailDomain", () => {
  it("accepts a domain with MX records", async () => {
    mockResolveMx.mockResolvedValue([{ exchange: "mx.example.com", priority: 10 }])
    expect(await validateEmailDomain("a@example.com")).toEqual({ ok: true })
  })

  it("rejects disposable domains without a DNS lookup", async () => {
    expect(await validateEmailDomain("bot@mailinator.com")).toEqual({ ok: false, reason: "disposable" })
    expect(mockResolveMx).not.toHaveBeenCalled()
  })

  it("rejects nonexistent domains (ENOTFOUND)", async () => {
    mockResolveMx.mockRejectedValue(Object.assign(new Error("nope"), { code: "ENOTFOUND" }))
    expect(await validateEmailDomain("a@no-such-domain-xyz.example")).toEqual({ ok: false, reason: "no_mx" })
  })

  it("rejects domains with zero MX records", async () => {
    mockResolveMx.mockResolvedValue([])
    expect(await validateEmailDomain("a@example.org")).toEqual({ ok: false, reason: "no_mx" })
  })

  it("fails OPEN on resolver trouble (SERVFAIL)", async () => {
    mockResolveMx.mockRejectedValue(Object.assign(new Error("servfail"), { code: "ESERVFAIL" }))
    expect(await validateEmailDomain("a@example.com")).toEqual({ ok: true })
  })

  it("rejects malformed emails with no domain", async () => {
    expect(await validateEmailDomain("nodomain")).toEqual({ ok: false, reason: "no_mx" })
  })
})
