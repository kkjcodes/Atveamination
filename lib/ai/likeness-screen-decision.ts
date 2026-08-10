// Pure decision logic for the public-figure screen. Kept SDK-free so tests
// can import it without tripping the Anthropic browser-env guardrail
// (same pattern as lib/business/adscript-input).

export type LikenessScreenResult = {
  block: boolean
  reason?: string
}

// Block ONLY on high-confidence recognition — a real user who merely
// resembles someone famous must never be locked out.
export function decideFromScreen(parsed: unknown): LikenessScreenResult {
  const p = parsed as { public_figure?: boolean; confidence?: string; name?: string } | null
  if (!p || typeof p !== "object") return { block: false }
  if (p.public_figure === true && p.confidence === "high") {
    return {
      block: true,
      reason: "This photo appears to show a well-known public figure. Please upload a photo of yourself, or of someone who has given you permission to use their likeness.",
    }
  }
  return { block: false }
}
