import { describe, it, expect, beforeEach } from "vitest"
import {
  mapProviderError,
  registerProviderErrorRecognizer,
  INTERRUPTED_ERROR,
  type UserFacingError,
} from "@/lib/async-work/errors"

describe("mapProviderError", () => {
  it("recognizes fal exhausted-balance messages", () => {
    const e = mapProviderError(new Error("User is locked. Reason: Exhausted balance."))
    expect(e.code).toBe("quota_exceeded")
    expect(e.retryable).toBe(true)
    expect(e.message.toLowerCase()).toContain("credit")
  })

  it("recognizes content-policy / moderation refusals", () => {
    for (const msg of ["Content policy violation", "NSFW content detected", "Safety filter triggered", "Moderation blocked"]) {
      const e = mapProviderError(new Error(msg))
      expect(e.code).toBe("content_policy")
      expect(e.retryable).toBe(false)
      expect(e.nextAction).toBeDefined()
    }
  })

  it("recognizes 422 Unprocessable Entity as input_invalid", () => {
    const e = mapProviderError(new Error("Unprocessable Entity"))
    expect(e.code).toBe("input_invalid")
  })

  it("recognizes the business TTS voice-service guard specifically", () => {
    const e = mapProviderError(new Error("The voice service is taking too long right now (waited 150s)"))
    expect(e.code).toBe("provider_timeout")
    expect(e.message).toContain("voice service is busy")
    expect(e.retryable).toBe(true)
  })

  it("recognizes timeouts", () => {
    for (const msg of ["ETIMEDOUT", "request timed out", "Timeout after 300s"]) {
      const e = mapProviderError(new Error(msg))
      expect(e.code).toBe("provider_timeout")
      expect(e.retryable).toBe(true)
    }
  })

  it("recognizes 404 / not found", () => {
    for (const msg of ["Not Found", "404 Application not found", "Model 'foo' not found"]) {
      const e = mapProviderError(new Error(msg))
      expect(e.code).toBe("not_found")
    }
  })

  it("recognizes 401 as auth_expired", () => {
    const e = mapProviderError(new Error("401 Unauthorized"))
    expect(e.code).toBe("auth_expired")
    expect(e.retryable).toBe(false)
  })

  it("recognizes network failures", () => {
    for (const msg of ["fetch failed", "ECONNREFUSED", "Network error"]) {
      const e = mapProviderError(new Error(msg))
      expect(e.code).toBe("network")
    }
  })

  it("falls back to internal for unknown errors", () => {
    const e = mapProviderError(new Error("something weird happened"))
    expect(e.code).toBe("internal")
    expect(e.retryable).toBe(true)
    expect(e.message).toBeDefined()
    expect(e.savedState).toBeDefined()
  })

  it("handles non-Error inputs safely", () => {
    for (const input of [null, undefined, "just a string", 42, {}]) {
      const e = mapProviderError(input)
      expect(e.code).toBe("internal")
    }
  })

  it("gives custom recognizers priority over generic ones", () => {
    // Simulated future GPU-backend recognizer that catches its own error shape.
    const customRecognizer = (raw: unknown): UserFacingError | null => {
      if (raw instanceof Error && raw.message.startsWith("GPU-BACKEND: ")) {
        return {
          code: "provider_error",
          message: "The dedicated GPU is warming up.",
          savedState: "Your work is saved.",
          nextAction: "Try in 30 seconds.",
          retryable: true,
        }
      }
      return null
    }
    registerProviderErrorRecognizer(customRecognizer)
    const e = mapProviderError(new Error("GPU-BACKEND: cold start"))
    expect(e.message).toContain("warming up")
  })
})

describe("INTERRUPTED_ERROR", () => {
  it("has all required fields for the stale-recovery UX", () => {
    expect(INTERRUPTED_ERROR.code).toBe("interrupted")
    expect(INTERRUPTED_ERROR.message).toBeDefined()
    expect(INTERRUPTED_ERROR.savedState).toBeDefined()
    expect(INTERRUPTED_ERROR.nextAction).toBeDefined()
    expect(INTERRUPTED_ERROR.retryable).toBe(true)
  })
})
