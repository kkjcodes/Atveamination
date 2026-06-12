import Anthropic from "@anthropic-ai/sdk"

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export const BRIEF_MODEL = "claude-haiku-4-5-20251001"
