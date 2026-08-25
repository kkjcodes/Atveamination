import { BRAND } from "@/config/brand"
// Shared error taxonomy for every long-running operation in the app
// (character augment/train, business render, scrapbook page/stitch,
// future: music generation, custom-GPU inference).
//
// Design goal: swapping an inference backend (Replicate → fal → self-hosted
// GPU) should NOT require changing calling code. Providers register a mapper
// that translates their raw errors into this shared shape.

export type AsyncErrorCode =
  | "network"            // Client couldn't reach our origin
  | "auth_expired"       // 401 — redirect to login with return URL
  | "not_found"          // Entity was deleted
  | "quota_exceeded"     // Daily/monthly cost cap tripped
  | "content_policy"     // AI provider refused user content
  | "provider_timeout"   // Upstream took too long (fal/replicate/GPU)
  | "provider_error"     // Upstream returned a non-timeout error
  | "input_invalid"      // User input was rejected (e.g. bad photo)
  | "interrupted"        // Container died mid-work (SIGTERM during deploy)
  | "internal"           // Anything unhandled

export type UserFacingError = {
  code: AsyncErrorCode
  message: string           // What happened, plain sentence
  savedState?: string       // What is safely persisted (e.g. "Your photos are saved.")
  nextAction?: string       // What the user should do (e.g. "Try again in a minute.")
  retryable: boolean        // Should the UI expose a retry button?
}

// A recognizer looks at an unknown error and either produces a mapped
// UserFacingError or returns null (meaning "not mine — try the next one").
// Registration is the extensibility point for new providers.
export type ProviderErrorRecognizer = (e: unknown) => UserFacingError | null

const recognizers: ProviderErrorRecognizer[] = []

export function registerProviderErrorRecognizer(r: ProviderErrorRecognizer): void {
  recognizers.push(r)
}

// Common HTTP/status-string patterns most providers exhibit. Applied first
// so registered recognizers don't need to re-implement them.
function recognizeCommonHttpShape(e: unknown): UserFacingError | null {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : ""
  if (!msg) return null
  const lower = msg.toLowerCase()

  if (lower.includes("exhausted balance") || lower.includes("insufficient credits")) {
    return {
      code: "quota_exceeded",
      message: "Our AI provider account is out of credits. This is on us — we're being notified.",
      savedState: "Your work is saved.",
      nextAction: "Try again in an hour. If it keeps happening, email ${BRAND.supportEmail}.",
      retryable: true,
    }
  }
  if (lower.includes("moderation") || lower.includes("safety") || lower.includes("content policy") || lower.includes("nsfw")) {
    return {
      code: "content_policy",
      message: "The AI declined to generate this. It usually happens with photos of small children or ambiguous scenes.",
      savedState: "Your inputs are saved.",
      nextAction: "Try a different photo or rewrite the description to be more specific about the setting.",
      retryable: false,
    }
  }
  if (lower.includes("unprocessable entity") || lower.includes("422")) {
    return {
      code: "input_invalid",
      message: "The AI couldn't process this input.",
      savedState: "Your work is saved.",
      nextAction: "Try a different photo or shorter description.",
      retryable: true,
    }
  }
  if (lower.includes("voice service is taking too long")) {
    // Thrown by the business TTS 150s guard when fal's Kokoro queue is
    // congested — surface the specific cause instead of the generic copy.
    return {
      code: "provider_timeout",
      message: "The voice service is busy right now, so we stopped the render instead of keeping you waiting.",
      savedState: "Your ad script is saved.",
      nextAction: "Try again in a few minutes.",
      retryable: true,
    }
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("etimedout")) {
    return {
      code: "provider_timeout",
      message: "The AI took longer than expected and stopped responding.",
      savedState: "Your inputs are saved.",
      nextAction: "Try again — this often works on retry.",
      retryable: true,
    }
  }
  if (lower.includes("not found") || lower.includes("404")) {
    return {
      code: "not_found",
      message: "This model or resource wasn't found.",
      nextAction: "Try again — we may need to rebuild it for you.",
      retryable: true,
    }
  }
  if (lower.includes("unauthorized") || lower.includes("401")) {
    return {
      code: "auth_expired",
      message: "Please sign in again.",
      retryable: false,
    }
  }
  if (lower.includes("network") || lower.includes("fetch failed") || lower.includes("econnrefused")) {
    return {
      code: "network",
      message: "We couldn't reach the AI service.",
      savedState: "Your work is saved.",
      nextAction: "Check your connection, then try again.",
      retryable: true,
    }
  }
  return null
}

export function mapProviderError(e: unknown): UserFacingError {
  for (const r of recognizers) {
    const hit = r(e)
    if (hit) return hit
  }
  const common = recognizeCommonHttpShape(e)
  if (common) return common
  // raw is retained in the log line (see fire.ts) — no need to smuggle it
  // into the UserFacingError shape.
  return {
    code: "internal",
    message: "Something went wrong on our end.",
    savedState: "Your work is saved.",
    nextAction: "Try again in a moment. If it keeps happening, email ${BRAND.supportEmail}.",
    retryable: true,
  }
}

// Explicit constructor for "container died mid-work" so route handlers can
// tag stale-recovery events uniformly.
export const INTERRUPTED_ERROR: UserFacingError = {
  code: "interrupted",
  message: "The last attempt stopped before finishing (usually happens right after a deploy).",
  savedState: "Everything you entered is saved.",
  nextAction: "Try again — it usually works on the second try.",
  retryable: true,
}
