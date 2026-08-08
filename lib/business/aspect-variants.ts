import type { AdScript, AspectRatio } from "@/lib/business/adscript-schema"

// "Make all 3 sizes": the same script re-rendered at a different aspect —
// only the aspect_ratio field changes; scenes/audio/text are reused verbatim.
export function scriptWithAspect(script: AdScript, aspect: AspectRatio): AdScript {
  return { ...script, aspect_ratio: aspect }
}
