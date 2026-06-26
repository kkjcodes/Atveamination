import Replicate from "replicate"

export const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN!,
})

export const MODELS = {
  // Image generation - FLUX Kontext Pro for style transfer (preserves identity)
  fluxKontextPro: "black-forest-labs/flux-kontext-pro",

  // LoRA training
  fluxLoraTrainer: "ostris/flux-dev-lora-trainer",

  // Scene generation fallback (no LoRA)
  fluxDev: "black-forest-labs/flux-dev",

  // Speech-to-text
  whisper: "openai/whisper",

  // Text-to-speech with voice cloning
  xttsV2: "lucataco/xtts-v2:684bc3855b37866c0c65add2ff39c78f3dea3f4ff103a436465326e0f438d55e",

  // Video generation — WAN 2.1 preserves cartoon/illustration style from the input frame
  wan: "wavespeedai/wan-2.1-i2v-480p",

  // Video stitching
  ffmpegConcat: "andreasjansson/ffmpeg",

  // Audio-driven lip sync (latent diffusion — handles stylized/cartoon faces)
  latentSync: "bytedance/latentsync",
} as const

// Instruction-style prompts for FLUX Kontext (edit the input image rather than generate from scratch)
// Batch 1 — shown immediately: warmer, more emotionally engaging styles
export const STYLE_BATCH_1 = ["pixar", "anime", "ghibli", "chibi"] as const
// Batch 2 — generated on demand via "Try more styles"
export const STYLE_BATCH_2 = ["comic", "sketch", "watercolor", "claymation"] as const

// Identity preservation directive prepended to every style transfer prompt.
// Phrased as "render only what is visible" rather than enumerating specific
// features (bindi/jewelry/etc) — enumerating them caused Kontext Pro to ADD
// those features even when absent from the source (e.g. rendering a male
// source as a woman with a bindi). Conditional + non-enumerated language
// preserves features that exist in the source without hallucinating new ones.
const IDENTITY_DIRECTIVE = "CRITICAL identity preservation: keep the EXACT same gender, age, face shape, skin tone, hair color, and hair length as the source photo. Render ONLY what is visible in the source — do NOT add facial hair, glasses, jewelry, accessories, or face markings that are not already present. Do NOT remove or alter any feature that IS present in the source. The person must be instantly recognizable as the same individual."

export const CARTOON_STYLE_PROMPTS: Record<string, string> = {
  pixar:      `${IDENTITY_DIRECTIVE} Transform into a Disney Pixar 3D animated character: expressive eyes, smooth shading, vibrant saturated colors, studio Pixar lighting.`,
  anime:      `${IDENTITY_DIRECTIVE} Transform into an anime character: large expressive eyes, clean cel-shaded lines, colorful hair, manga illustration style.`,
  ghibli:     `${IDENTITY_DIRECTIVE} Transform into a Studio Ghibli character: soft watercolor-like shading, warm muted colors, gentle rounded features, Hayao Miyazaki hand-drawn illustration style.`,
  chibi:      `${IDENTITY_DIRECTIVE} Transform into a chibi cartoon character: large head, big expressive eyes, small cute body, kawaii illustration style with soft pastel colors.`,
  comic:      `${IDENTITY_DIRECTIVE} Transform into a comic book character: bold ink outlines, halftone dot shading, primary colors, classic superhero comic art style.`,
  sketch:     `${IDENTITY_DIRECTIVE} Transform into a pencil sketch cartoon portrait: hand-drawn lines, soft charcoal textures, black-and-white illustration style with subtle color.`,
  watercolor: `${IDENTITY_DIRECTIVE} Transform into a watercolor portrait illustration: soft watercolor washes, delicate brushstroke textures, gentle blending, pastel tones, artistic hand-painted style.`,
  claymation: `${IDENTITY_DIRECTIVE} Transform into a claymation character: clay-like texture, soft rounded shapes, warm studio lighting, Aardman or Laika stop-motion look.`,
}

// Unique trigger word per character, derived from its ID — no DB storage needed.
// Must be identical at training time and inference time.
export function characterTriggerWord(characterId: string): string {
  return `CHAR${characterId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

// Per-style keywords injected into image and video generation prompts
export const STYLE_HINTS: Record<string, { image: string; video: string }> = {
  pixar:      { image: "Disney Pixar 3D animated style, smooth shading, expressive, illustrated cartoon background, painted animation background, no photorealism",     video: "Pixar 3D animated cartoon, illustrated background, painted animation scene, vibrant colors, smooth motion, no real-world background" },
  anime:      { image: "anime illustration, cel-shaded, manga style, anime background art, illustrated environment, no photorealism",                                    video: "anime animation, cel-shaded, illustrated anime background, fluid motion, no real-world background" },
  ghibli:     { image: "Studio Ghibli animation style, soft watercolor shading, warm muted colors, hand-drawn, illustrated painterly background, no photorealism",       video: "Studio Ghibli animated scene, soft watercolor colors, illustrated background, gentle fluid motion, hand-drawn animation style, no real-world background" },
  chibi:      { image: "chibi kawaii anime style, big expressive eyes, cute proportions, pastel colors, illustrated cel-shaded background, no photorealism",              video: "chibi kawaii anime animation, illustrated background, cute bouncy motion, pastel colors, no real-world background" },
  comic:      { image: "comic book art, bold ink outlines, halftone shading, illustrated background, flat color background, no photorealism",                            video: "comic book animation, bold lines, illustrated background, saturated colors, no real-world background" },
  sketch:     { image: "pencil sketch illustration, hand-drawn, charcoal texture, sketched background, hand-drawn environment, no photorealism",                         video: "animated sketch illustration, hand-drawn background, hand-drawn motion, no real-world background" },
  watercolor: { image: "watercolor illustration, soft brushstrokes, painted artistic style, watercolor wash background, delicate textures, no photorealism",              video: "watercolor animated illustration, soft painted motion, watercolor background, artistic style, no real-world background" },
  claymation: { image: "claymation stop-motion style, clay texture, rounded shapes, Aardman animation style, illustrated clay background, no photorealism",               video: "claymation animation, clay texture, stop-motion style, illustrated background, smooth motion, no real-world background" },
  default:    { image: "2D animated cartoon, cel-shaded illustration, vibrant colors, illustrated cartoon background, painted background, no photorealism",               video: "2D cartoon animation, illustrated background, painted animation scene, vibrant colors, animated movie style, no real-world background" },
}
