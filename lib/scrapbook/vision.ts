import { anthropic } from "@/lib/ai/client"
import { SCRAPBOOK_MODELS, STYLE_PRESETS, type ScrapbookStyle } from "@/lib/scrapbook/config"
import { parseShotPlan, type ShotPlan } from "@/lib/scrapbook/models"
import { parseVisionJson } from "@/lib/scrapbook/vision-parse"

export { parseVisionJson }

// Stage 1: Sonnet vision → strict-JSON ShotPlan.
//
// The prompt IS the product here. The `after_frame_prompt` constraint (same
// angle, subjects, clothing, setting — only the action progresses 1-2s) is
// what makes RIFE interpolation and WAN FLF2V tractable. Do not let this
// drift toward "new scene".
//
// The motion_class classifier drives cost routing:
//   - subtle  → RIFE (~$0.10/page)  — no content travels or appears
//   - dynamic → WAN FLF2V (~$0.50/page) — throwing/jumping/running
// When unsure, choose subtle. QC + Ken Burns fallback backstops a bad choice.

const SYSTEM = "You are a shot planner for a silent, heartwarming scrapbook video. You respond ONLY with a single JSON object matching the example shape EXACTLY — every field name must be present. No markdown, no prose, no code fences."

// Explicit example so Sonnet never omits a field even when it can't identify
// the content (was omitting "subjects" on group / archival photos where it
// declined to describe people). Field values are illustrative — override them
// with real observations, but never drop keys.
const EXAMPLE_SHOTPLAN = `{
  "subjects": "a father in his 30s and a young daughter, roughly 5 years old",
  "action": "the daughter tosses a small red ball toward her father, who is crouching with arms open",
  "setting": "a sunlit backyard lawn, late afternoon warm light, wooden fence in background",
  "before_frame_prompt": "watercolor illustration of a father crouched with open arms, young daughter mid-throw with red ball leaving her hand, sunlit backyard lawn, wooden fence, warm afternoon light",
  "after_frame_prompt": "watercolor illustration of the same father crouched with open arms, same daughter with hands now empty, red ball halfway toward the father in mid-air, identical sunlit backyard lawn, identical wooden fence, identical warm afternoon light",
  "motion_prompt": "the daughter throws the ball in a gentle arc toward her father",
  "caption": "A tiny throw, a giant heart.",
  "motion_class": "dynamic"
}`

function buildUserPrompt(stylePrompt: string): string {
  return `Analyze this photo and produce a shot plan as JSON.

EXAMPLE of the exact JSON shape you must return (field names are literal — every key MUST be present, even if the content is uncertain):
${EXAMPLE_SHOTPLAN}

Rules for THIS photo (STRICT — every field required, no omissions):
- "subjects": REQUIRED. Who is in the photo (approx ages, relationships if inferable). Do not guess names. If unclear, write a best description ("a group of people" or "an unidentified person"). NEVER omit this key.
- "action": REQUIRED. What they are doing (even if still — "posing for a formal portrait").
- "setting": REQUIRED. Location, lighting, time of day (even for indoor / studio — "indoor studio, soft even lighting").
- "before_frame_prompt": REQUIRED. Rich visual description of THIS exact captured moment, rewritten in the style "${stylePrompt}". Include subject count, poses, clothing colors, setting.
- "after_frame_prompt": REQUIRED. The SAME action 1-2 seconds LATER. HARD CONSTRAINTS: identical camera angle, identical subjects (same count, same clothing, same appearance), identical setting. Only the action progresses. Same style "${stylePrompt}".
- "motion_prompt": REQUIRED. One sentence describing the motion between the two moments.
- "caption": REQUIRED. A warm scrapbook caption, 8 words max, no names.
- "motion_class": REQUIRED. Exactly "subtle" or "dynamic".
  "subtle" = between the two moments, nothing travels across the frame and nothing appears/disappears — smiling, posing, hugging, gentle sway, small head turn, hair in breeze.
  "dynamic" = an object or limb travels visibly — throwing, kicking, jumping, running, splashing, a ball/pet moving.
  When unsure, choose "subtle".

Respond with the JSON object only.`
}

export async function extractShotPlan(
  imageBuffer: Buffer,
  mimeType: "image/jpeg" | "image/png" | "image/gif" | "image/webp",
  style: ScrapbookStyle,
): Promise<ShotPlan> {
  const preset = STYLE_PRESETS[style]
  if (!preset) throw new Error(`Unknown style: ${style}`)

  const msg = await anthropic.messages.create({
    model: SCRAPBOOK_MODELS.vision,
    max_tokens: 1000,
    system: SYSTEM,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mimeType, data: imageBuffer.toString("base64") } },
        { type: "text", text: buildUserPrompt(preset.prompt) },
      ],
    }],
  })

  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("")

  return parseShotPlan(parseVisionJson(text))
}
