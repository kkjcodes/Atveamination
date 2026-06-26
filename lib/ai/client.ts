import Anthropic from "@anthropic-ai/sdk"

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

// Haiku for high-volume, low-stakes calls (per-scene moderation, gender detect).
export const BRIEF_MODEL = "claude-haiku-4-5-20251001"

// Sonnet for character/scene visual description — runs once per character/scene,
// and accuracy directly affects every downstream image generation. Haiku miscalled
// a 40-year-old man as "mid-20s", which pulled all downstream renderings younger.
export const VISION_MODEL = "claude-sonnet-4-6"
