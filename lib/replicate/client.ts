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
} as const

// Instruction-style prompts for FLUX Kontext (edit the input image rather than generate from scratch)
export const CARTOON_STYLE_PROMPTS: Record<string, string> = {
  pixar: "Transform this person into a Disney Pixar 3D animated character. Keep their facial features and expression. Give them expressive eyes, smooth shading, vibrant saturated colors, and studio lighting like a Pixar film.",
  anime: "Transform this person into an anime character. Keep their facial features. Give them large expressive eyes, clean cel-shaded lines, colorful hair, and a manga illustration style.",
  comic: "Transform this person into a comic book character. Keep their facial features. Add bold ink outlines, halftone dot shading, primary colors, and a classic superhero comic art style.",
  sketch: "Transform this person into a pencil sketch cartoon portrait. Keep their facial features. Use hand-drawn lines, soft charcoal textures, and a black-and-white illustration style with subtle color.",
}

// Unique trigger word per character, derived from its ID — no DB storage needed.
// Must be identical at training time and inference time.
export function characterTriggerWord(characterId: string): string {
  return `CHAR${characterId.replace(/-/g, "").slice(0, 8).toUpperCase()}`
}

// Per-style keywords injected into image and video generation prompts
export const STYLE_HINTS: Record<string, { image: string; video: string }> = {
  pixar:  { image: "Disney Pixar 3D animated style, smooth shading, expressive, illustrated cartoon background, painted animation background, no photorealism",  video: "Pixar 3D animated cartoon, illustrated background, painted animation scene, vibrant colors, smooth motion, no real-world background" },
  anime:  { image: "anime illustration, cel-shaded, manga style, anime background art, illustrated environment, no photorealism",                                  video: "anime animation, cel-shaded, illustrated anime background, fluid motion, no real-world background" },
  comic:  { image: "comic book art, bold ink outlines, halftone shading, illustrated background, flat color background, no photorealism",                          video: "comic book animation, bold lines, illustrated background, saturated colors, no real-world background" },
  sketch: { image: "pencil sketch illustration, hand-drawn, charcoal texture, sketched background, hand-drawn environment, no photorealism",                       video: "animated sketch illustration, hand-drawn background, hand-drawn motion, no real-world background" },
  default:{ image: "2D animated cartoon, cel-shaded illustration, vibrant colors, illustrated cartoon background, painted background, no photorealism",            video: "2D cartoon animation, illustrated background, painted animation scene, vibrant colors, animated movie style, no real-world background" },
}
