import Anthropic from "@anthropic-ai/sdk"

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// ── Budget guard enforcement ───────────────────────────────────────────────
// messages.create passes through the global spend guard (lib/budget/guard.ts).
// Defensive: unit tests mock the SDK with partial shapes; only patch what exists.
const rawMessagesCreate = typeof anthropic.messages?.create === "function"
  ? anthropic.messages.create.bind(anthropic.messages)
  : null
if (rawMessagesCreate) anthropic.messages.create = (async (opts: { model: string }, ...rest: unknown[]) => {
  const g = await import("@/lib/budget/guard")
  await g.gateAndRecord("anthropic", opts.model)
  try {
    return await (rawMessagesCreate as (o: unknown, ...r: unknown[]) => Promise<unknown>)(opts, ...rest)
  } catch (e) {
    g.tripBreakerIfBalanceError(e)
    throw e
  }
}) as unknown as typeof anthropic.messages.create

// Haiku for high-volume, low-stakes calls (per-scene moderation, gender detect).
export const BRIEF_MODEL = "claude-haiku-4-5-20251001"

// Sonnet for character/scene visual description — runs once per character/scene,
// and accuracy directly affects every downstream image generation. Haiku miscalled
// a 40-year-old man as "mid-20s", which pulled all downstream renderings younger.
export const VISION_MODEL = "claude-sonnet-4-6"
