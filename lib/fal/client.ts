import { fal } from "@fal-ai/client"

fal.config({ credentials: process.env.FAL_KEY })

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

export const PRESET_VOICES = [
  { id: "af_heart",    label: "Aria",     description: "Warm & friendly",     gender: "female" as const, accent: "american" as const },
  { id: "af_bella",    label: "Bella",    description: "Clear & articulate",   gender: "female" as const, accent: "american" as const },
  { id: "af_nicole",   label: "Nicole",   description: "Soft & calming",       gender: "female" as const, accent: "american" as const },
  { id: "af_sarah",    label: "Sarah",    description: "Upbeat & expressive",  gender: "female" as const, accent: "american" as const },
  { id: "af_sky",      label: "Sky",      description: "Youthful & bright",    gender: "female" as const, accent: "american" as const },
  { id: "am_adam",     label: "Adam",     description: "Conversational",        gender: "male"   as const, accent: "american" as const },
  { id: "am_michael",  label: "Michael",  description: "Deep & authoritative",  gender: "male"   as const, accent: "american" as const },
  { id: "bf_emma",     label: "Emma",     description: "Warm British accent",   gender: "female" as const, accent: "british"  as const },
  { id: "bf_isabella", label: "Isabella", description: "Expressive & vivid",    gender: "female" as const, accent: "british"  as const },
  { id: "bm_george",   label: "George",   description: "Formal & refined",      gender: "male"   as const, accent: "british"  as const },
  { id: "bm_lewis",    label: "Lewis",    description: "Friendly & natural",    gender: "male"   as const, accent: "british"  as const },
] as const

export type PresetVoiceId = typeof PRESET_VOICES[number]["id"]
