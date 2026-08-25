import { fal } from "@fal-ai/client"

fal.config({ credentials: process.env.FAL_KEY })

// ── Budget guard enforcement (server-only, lazy-loaded) ────────────────────
// Paid methods (subscribe, queue.submit) are patched to pass through the
// global spend guard before the provider is called. Patching the SDK
// singleton means every call path — including falAny below — is covered;
// no call site can bypass the ceiling. The guard is dynamically imported so
// this module stays safe to import from client components (PRESET_VOICES).
// Free methods (queue.status, queue.result) are untouched.
type GuardModule = typeof import("@/lib/budget/guard")
async function guard(): Promise<GuardModule> {
  return import("@/lib/budget/guard")
}

// Defensive: unit tests mock the SDK with partial shapes; only patch what exists.
const rawSubscribe = typeof fal.subscribe === "function" ? fal.subscribe.bind(fal) : null
const rawQueueSubmit = typeof fal.queue?.submit === "function" ? fal.queue.submit.bind(fal.queue) : null

if (rawSubscribe) fal.subscribe = (async (model: string, opts: unknown) => {
  const g = await guard()
  await g.gateAndRecord("fal", model)
  try {
    return await (rawSubscribe as (m: string, o: unknown) => Promise<unknown>)(model, opts)
  } catch (e) {
    g.tripBreakerIfBalanceError(e)
    throw e
  }
}) as typeof fal.subscribe

if (rawQueueSubmit) fal.queue.submit = (async (model: string, opts: unknown) => {
  const g = await guard()
  await g.gateAndRecord("fal", model)
  try {
    return await (rawQueueSubmit as (m: string, o: unknown) => Promise<unknown>)(model, opts)
  } catch (e) {
    g.tripBreakerIfBalanceError(e)
    throw e
  }
}) as typeof fal.queue.submit

export { fal }

export const FAL_MODELS = {
  wan: "fal-ai/wan-i2v",
  loraTraining: "fal-ai/flux-lora-fast-training",
  // Flux + LoRA inference. The old fal-ai/flux-dev endpoint was deprecated;
  // fal-ai/flux-lora is the current LoRA-supporting Flux endpoint.
  fluxLora: "fal-ai/flux-lora",
  kokoro: "fal-ai/kokoro",
  // Multi-image Kontext — takes multiple reference images and composes them
  // into one scene. Used for shared multi-character scenes (no LoRA stacking).
  kontextMulti: "fal-ai/flux-pro/kontext/multi",
} as const

// Untyped subscribe/queue helpers for models whose SDK-side input shapes we
// haven't verified yet (scrapbook pipeline is currently placeholder-model
// territory). Once real model IDs and schemas are locked in, replace call
// sites with the typed `fal.subscribe`/`fal.queue.submit`.
type UnknownInput = Record<string, unknown>
type UnknownResult = { data: unknown }

export const falAny = {
  subscribe(model: string, opts: { input: UnknownInput }): Promise<UnknownResult> {
    return (fal.subscribe as unknown as (m: string, o: { input: UnknownInput }) => Promise<UnknownResult>)(model, opts)
  },
  queueSubmit(
    model: string,
    opts: { input: UnknownInput; webhookUrl?: string },
  ): Promise<{ request_id: string }> {
    return (fal.queue.submit as unknown as (m: string, o: { input: UnknownInput; webhookUrl?: string }) => Promise<{ request_id: string }>)(model, opts)
  },
}


// Voice catalog + helpers moved to lib/fal/voices.ts (client-safe module);
// re-exported here so existing server imports keep working.
export { PRESET_VOICES, SUPPORTED_LANGUAGES, languageForVoice, kokoroSpeedForBudget } from "@/lib/fal/voices"
export type { PresetVoiceId, VoiceLanguage } from "@/lib/fal/voices"
