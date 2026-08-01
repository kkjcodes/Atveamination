import { anthropic, VISION_MODEL } from "@/lib/ai/client"
import { parseVisionJson } from "@/lib/scrapbook/vision-parse"
import {
  MOTIONS,
  MUSIC_LEVELS,
  PALETTE_HINTS,
  SCENE_TYPES,
  TEXT_POSITIONS,
  VOICES,
  validateAdScript,
  type AdScript,
  type ValidationError,
  type ValidateContext,
} from "@/lib/business/adscript-schema"
import type { AdScriptInput } from "@/lib/business/adscript-input"

// M3: Sonnet vision produces a full AdScript from photos + business fields.
// The prompt IS the product here — enforcing structure and word caps in the
// prompt is how we minimize repair-retry cost.
//
// Two-attempt design: initial generation → validate → if errors, one repair
// prompt containing the specific error list → validate again → hard fail
// to the user if still invalid (they can request AI generate again).

// Re-export pure helpers so consumers can keep a single import path. Tests
// that don't need the Anthropic-loading module can import directly from
// @/lib/business/adscript-input.
export {
  makeAdScriptInput,
  coerceAspectRatio,
  coerceTemplateFamily,
} from "@/lib/business/adscript-input"
export type {
  MusicOption,
  AdScriptInput,
  AdScriptInputBusiness,
} from "@/lib/business/adscript-input"

const SYSTEM =
  "You are a video ad creative director. You respond ONLY with a single JSON object matching the AdScript schema exactly — every field name must match the example. No markdown, no prose, no code fences."

// EXACT field names matter here — Sonnet has been observed inventing plausible-
// but-wrong names like "overlay_text", "heading", "duration" when the schema is
// only described in prose. Show the JSON literally so it copies field names.
const EXAMPLE_SCRIPT = `{
  "template_family": "clean_modern",
  "aspect_ratio": "9:16",
  "audio": { "voice": "warm_f", "music_id": "chill_modern_peaceful_01", "music_level": "normal" },
  "style": { "palette_hint": "warm", "text_position": "lower_third" },
  "scenes": [
    { "type": "hook",    "text": "New in the neighborhood.",           "vo_text": "Something new just opened on Elm Street.",         "asset_id": "PHOTO_ID_1", "min_seconds": 3, "motion": "slow_zoom_in" },
    { "type": "benefit", "text": "Fresh pastries every morning.",       "vo_text": "Fresh pastries baked every morning right on site.", "asset_id": "PHOTO_ID_2", "min_seconds": 4, "motion": "pan_right" },
    { "type": "cta",     "text": "Come say hi this Saturday.",          "vo_text": "Come by this Saturday and say hello.",              "asset_id": "PHOTO_ID_3", "min_seconds": 3, "motion": "hold" },
    { "type": "end_card", "lines": ["Rosie's Bakery", "12 Elm Street", "Open 7am daily"], "min_seconds": 3 }
  ]
}`

function buildPrompt(input: AdScriptInput, priorErrors: ValidationError[] | null): string {
  const assetList = input.photos.map((p, i) => `  ${i + 1}. asset_id="${p.assetId}"`).join("\n")
  const musicList = input.availableMusic.map((m) => `"${m.id}" (${m.label})`).join(", ")
  const logoLine = input.logoAssetId
    ? `logo_asset_id available for end_card: "${input.logoAssetId}"`
    : `No logo uploaded — omit logo_asset_id in the end_card.`

  const priorBlock = priorErrors && priorErrors.length > 0
    ? `\n\nYOUR PREVIOUS RESPONSE HAD THESE ERRORS — fix ALL of them:\n${priorErrors.map((e) => `  - ${e.path}: ${e.message}`).join("\n")}\n\n`
    : ""

  return `Write an AdScript for this business.

Business: ${input.businessName}
One-liner: ${input.oneLiner}
${input.address ? `Address: ${input.address}` : ""}
${input.notes ? `Notes: ${input.notes}` : ""}
Template family: ${input.templateFamily}
Aspect ratio: ${input.aspectRatio}
${logoLine}

Photos (${input.photos.length}) available:
${assetList}

EXAMPLE of the exact JSON shape you must return (field names are literal — copy them verbatim, only change values):
${EXAMPLE_SCRIPT}

Rules (STRICT — validation will reject violations):
- 3 to 7 scenes total.
- Scene types: ${SCENE_TYPES.join(" | ")}. Exactly one end_card, and it MUST be the last scene.
- Field names on hook/benefit/cta scenes: type, text, vo_text, asset_id, min_seconds, motion (and optional pronunciation_hint). Use "text" — NOT "overlay_text", "heading", "title", or any other name.
- Field names on end_card: type, lines, min_seconds (and optional logo_asset_id, vo_text). Use "lines" as a JSON array of strings — NOT "text_lines" or a single string.
- Every non-end_card scene needs a valid asset_id from the list above.
- Word caps for the "text" field: hook ≤ 8 words, benefit ≤ 12 words, cta ≤ 8 words.
- End-card lines: ≤ 40 chars each, at least one line.
- vo_text: required on every non-end_card scene, ≤ 30 words. Natural spoken sentence, not a copy of the overlay text.
- pronunciation_hint: OPTIONAL. Add ONLY when a word is likely mispronounced by TTS (e.g. non-English names, initialisms, street types). Format: brief respelling ("Nguyen's -> Win's").
- min_seconds: 3–7 per scene (positive number, required on every scene including end_card). Actual playback stretches to (min_seconds OR vo_duration + 0.5, whichever is greater).
- Derived total duration must be 10–35 seconds.
- template_family: "${input.templateFamily}"
- aspect_ratio: "${input.aspectRatio}"
- audio.voice: one of ${VOICES.join(", ")}. Pick the voice that best fits the business's tone.
- audio.music_id: one of ${musicList}
- audio.music_level: one of ${MUSIC_LEVELS.join(", ")}. Default "normal".
- style.palette_hint: one of ${PALETTE_HINTS.join(", ")}
- style.text_position: one of ${TEXT_POSITIONS.join(", ")}
- motion (per scene): one of ${MOTIONS.join(", ")}

${priorBlock}Respond with the JSON object only.`
}

async function callClaude(input: AdScriptInput, priorErrors: ValidationError[] | null): Promise<unknown> {
  const content: Array<
    | { type: "image"; source: { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string } }
    | { type: "text"; text: string }
  > = []
  for (const p of input.photos) {
    const mime = (p.mimeType.startsWith("image/") ? p.mimeType : "image/jpeg") as
      "image/jpeg" | "image/png" | "image/gif" | "image/webp"
    content.push({
      type: "image",
      source: { type: "base64", media_type: mime, data: p.buffer.toString("base64") },
    })
  }
  content.push({ type: "text", text: buildPrompt(input, priorErrors) })

  const msg = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 2500,
    system: SYSTEM,
    messages: [{ role: "user", content }],
  })

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
  return parseVisionJson(text)
}

export type AdScriptResult =
  | { ok: true; script: AdScript; repairUsed: boolean }
  | { ok: false; errors: ValidationError[]; lastAttempt: unknown }

export async function generateAdScript(input: AdScriptInput): Promise<AdScriptResult> {
  const ctx: ValidateContext = {
    validAssetIds: new Set(input.photos.map((p) => p.assetId)),
    validLogoAssetId: input.logoAssetId,
  }

  // Attempt 1
  let attempt: unknown
  try {
    attempt = await callClaude(input, null)
  } catch (e) {
    return { ok: false, errors: [{ path: "$", message: `initial call failed: ${(e as Error)?.message}` }], lastAttempt: null }
  }
  let errors = validateAdScript(attempt, ctx)
  if (errors.length === 0) return { ok: true, script: attempt as AdScript, repairUsed: false }

  // Attempt 2 (repair)
  try {
    attempt = await callClaude(input, errors)
  } catch (e) {
    return { ok: false, errors: [{ path: "$", message: `repair call failed: ${(e as Error)?.message}` }], lastAttempt: attempt }
  }
  errors = validateAdScript(attempt, ctx)
  if (errors.length === 0) return { ok: true, script: attempt as AdScript, repairUsed: true }

  return { ok: false, errors, lastAttempt: attempt }
}

// Pure helpers (makeAdScriptInput / coerceTemplateFamily / coerceAspectRatio)
// live in @/lib/business/adscript-input and are re-exported at the top of
// this file.
