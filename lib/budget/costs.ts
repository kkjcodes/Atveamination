// Estimated per-call cost (USD) by operation. Sources: provider pricing pages
// + the measured numbers in CLAUDE.md §11. These feed spend_ledger estimates —
// they should be right to within ~2x, not to the cent. Unknown operations get
// DEFAULT_COST so a new call site can never silently bypass budget accounting.
export const OPERATION_COSTS: Record<string, number> = {
  // fal
  "fal:fal-ai/wan-i2v": 0.5,
  "fal:fal-ai/flux-lora-fast-training": 0.4,
  "fal:fal-ai/flux-lora": 0.04,
  "fal:fal-ai/flux-pro/kontext/multi": 0.05,
  "fal:fal-ai/kokoro": 0.005,
  "fal:fal-ai/kokoro/american-english": 0.005,
  "fal:fal-ai/kokoro/british-english": 0.005,
  "fal:fal-ai/kokoro/hindi": 0.005,
  "fal:fal-ai/kokoro/spanish": 0.005,
  // replicate
  "replicate:black-forest-labs/flux-kontext-pro": 0.04,
  "replicate:bytedance/latentsync": 0.05,
  "replicate:openai/whisper": 0.01,
  "replicate:lucataco/xtts-v2": 0.05,
  "replicate:wavespeedai/wan-2.1-i2v-480p": 0.25,
  "replicate:ostris/flux-dev-lora-trainer": 2.0,
  "replicate:black-forest-labs/flux-dev": 0.025,
  "replicate:andreasjansson/ffmpeg": 0.01,
  // anthropic (per call, typical payload)
  "anthropic:claude-sonnet-4-6": 0.015,
  "anthropic:claude-haiku-4-5-20251001": 0.002,
}

export const DEFAULT_COST = 0.05

export function estimateCost(provider: string, model: string): number {
  // Replicate models may carry a ":version" suffix — strip for lookup.
  const key = `${provider}:${model.split(":")[0]}`
  return OPERATION_COSTS[key] ?? DEFAULT_COST
}
