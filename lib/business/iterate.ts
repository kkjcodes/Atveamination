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

// M5: conversational iteration. User submits plain-English change request;
// Claude returns a FULL revised AdScript (not a patch — simpler to validate).
// Same two-attempt (initial + repair) contract as generation.

export type IterateInput = {
  currentScript: AdScript
  editRequest: string
  // Same validation context as generation — asset ownership must survive.
  validAssetIds: Set<string>
  validLogoAssetId: string | null
  availableMusicIds: string[]
}

export type IterateResult =
  | { ok: true; script: AdScript; repairUsed: boolean }
  | { ok: false; errors: ValidationError[]; lastAttempt: unknown }

const SYSTEM =
  "You revise ad scripts. Given a current AdScript and a plain-English edit request, return a FULL REVISED AdScript matching the exact same schema. Every field the current script had must be present in your response with the same key names. Respond ONLY with JSON — no prose, no fences."

// Same JSON shape reference we give to the generation prompt. Sonnet has
// been observed dropping keys ("text", "vo_text", "min_seconds") during
// iteration when the user asks for something small — the current-script
// JSON in the prompt is a template, but adding an explicit shape reference
// makes drop-outs much rarer.
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

function buildIteratePrompt(input: IterateInput, priorErrors: ValidationError[] | null): string {
  const priorBlock = priorErrors && priorErrors.length > 0
    ? `\n\nYOUR PREVIOUS RESPONSE HAD THESE ERRORS — fix ALL of them:\n${priorErrors.map((e) => `  - ${e.path}: ${e.message}`).join("\n")}\n\n`
    : ""

  return `Revise this AdScript per the user's request. Return a FULL revised script. Field names are literal — copy them verbatim from the example, only change values.

SCHEMA EXAMPLE (for field names — do not copy values):
${EXAMPLE_SCRIPT}

CURRENT ADSCRIPT (the one to revise):
${JSON.stringify(input.currentScript, null, 2)}

USER REQUEST:
${input.editRequest.trim()}

RULES (must still hold in the revised script):
- Keep every field the current script had. Do not drop keys. Only change values as needed to honor the user's request.
- Field names on hook/benefit/cta: type, text, vo_text, asset_id, min_seconds, motion (optional pronunciation_hint). Use "text" — NOT "overlay_text" or any other name.
- Field names on end_card: type, lines, min_seconds (optional logo_asset_id, vo_text). Use "lines" as an array of strings.
- 3 to 7 scenes total. Exactly one end_card, LAST scene.
- Scene types: ${SCENE_TYPES.join(" | ")}.
- Word caps: hook ≤ 8 words, benefit ≤ 12, cta ≤ 8, end_card line ≤ 40 chars.
- vo_text required on non-end_card scenes, ≤ 30 words.
- pronunciation_hint OPTIONAL (respell hard-to-say words, e.g. "Nguyen's -> Win's").
- audio.voice: ${VOICES.join(" | ")}
- audio.music_id: one of ${input.availableMusicIds.map((m) => `"${m}"`).join(", ")}
- audio.music_level: ${MUSIC_LEVELS.join(" | ")}
- style.palette_hint: ${PALETTE_HINTS.join(" | ")}
- style.text_position: ${TEXT_POSITIONS.join(" | ")}
- motion (per scene): ${MOTIONS.join(" | ")}
- asset_id must remain one of the current script's asset_ids (photos are fixed for this ad).
- min_seconds is required on every scene including end_card (positive number, 3-7).
- Derived total duration 10–35s.

Apply the user's request minimally. If they only asked for a headline change, don't rewrite everything.${priorBlock}

Respond with the JSON only.`
}

async function callClaude(input: IterateInput, priorErrors: ValidationError[] | null): Promise<unknown> {
  const msg = await anthropic.messages.create({
    model: VISION_MODEL,
    max_tokens: 2500,
    system: SYSTEM,
    messages: [{ role: "user", content: [{ type: "text", text: buildIteratePrompt(input, priorErrors) }] }],
  })
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")
  return parseVisionJson(text)
}

export async function iterateAdScript(input: IterateInput): Promise<IterateResult> {
  const ctx: ValidateContext = {
    validAssetIds: input.validAssetIds,
    validLogoAssetId: input.validLogoAssetId,
  }

  let attempt: unknown
  try {
    attempt = await callClaude(input, null)
  } catch (e) {
    return { ok: false, errors: [{ path: "$", message: `initial call failed: ${(e as Error)?.message}` }], lastAttempt: null }
  }
  let errors = validateAdScript(attempt, ctx)
  if (errors.length === 0) return { ok: true, script: attempt as AdScript, repairUsed: false }

  try {
    attempt = await callClaude(input, errors)
  } catch (e) {
    return { ok: false, errors: [{ path: "$", message: `repair call failed: ${(e as Error)?.message}` }], lastAttempt: attempt }
  }
  errors = validateAdScript(attempt, ctx)
  if (errors.length === 0) return { ok: true, script: attempt as AdScript, repairUsed: true }

  return { ok: false, errors, lastAttempt: attempt }
}

// buildRevertVersion is re-exported from lib/business/iterate-revert.ts
// (kept there so test files don't drag in the Anthropic SDK on import).
export { buildRevertVersion } from "@/lib/business/iterate-revert"
