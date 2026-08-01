// AdScript contract per BUSINESS-FORK-HANDOFF.md §3.
// Hand-rolled validator (matches the `parseShotPlan` pattern in scrapbook —
// avoids adding a zod dep for one schema).

export const TEMPLATE_FAMILIES = ["clean_modern", "bold_promo", "scrapbook"] as const
export const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const
export const VOICES = ["warm_f", "confident_m", "energetic_f", "calm_m"] as const
export const MUSIC_LEVELS = ["normal", "quiet", "off"] as const
export const MOTIONS = ["slow_zoom_in", "slow_zoom_out", "pan_left", "pan_right", "hold"] as const
export const SCENE_TYPES = ["hook", "benefit", "cta", "end_card"] as const
export const TEXT_POSITIONS = ["lower_third", "center", "upper_third"] as const
export const PALETTE_HINTS = ["warm", "cool", "neutral", "bright"] as const

export type TemplateFamily = typeof TEMPLATE_FAMILIES[number]
export type AspectRatio = typeof ASPECT_RATIOS[number]
export type Voice = typeof VOICES[number]
export type MusicLevel = typeof MUSIC_LEVELS[number]
export type Motion = typeof MOTIONS[number]
export type SceneType = typeof SCENE_TYPES[number]
export type TextPosition = typeof TEXT_POSITIONS[number]
export type PaletteHint = typeof PALETTE_HINTS[number]

export type AdScriptScene =
  | {
      type: "hook" | "benefit" | "cta"
      text: string          // burned overlay copy
      vo_text: string       // spoken narration
      pronunciation_hint?: string  // per M3 mitigation for TTS mispronounce
      asset_id: string
      min_seconds: number
      motion: Motion
    }
  | {
      type: "end_card"
      logo_asset_id?: string
      vo_text?: string
      lines: string[]       // e.g. ["Rosie's Bakery", "123 Example Street", "Open 6am"]
      min_seconds: number
    }

export type AdScript = {
  template_family: TemplateFamily
  aspect_ratio: AspectRatio
  audio: {
    voice: Voice
    music_id: string        // one of the bundled tracks; verified vs library at render time
    music_level: MusicLevel
  }
  scenes: AdScriptScene[]
  style: {
    palette_hint: PaletteHint
    text_position: TextPosition
  }
}

// ── Word-count caps (doc §3) ────────────────────────────────────────────────
const WORD_CAP_HOOK = 8
const WORD_CAP_BENEFIT = 12
const WORD_CAP_CTA = 8
const CHAR_CAP_END_CARD_LINE = 40
const VO_WORD_CAP = 30

const SCENE_MIN = 3
const SCENE_MAX = 7
const TOTAL_MIN_SEC = 10
const TOTAL_MAX_SEC = 35

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length
}

export type ValidationError = { path: string; message: string }

export type ValidateContext = {
  // asset_id → true if the asset exists and belongs to the business
  validAssetIds: Set<string>
  // logo asset id (or null) — used to sanity-check end_card.logo_asset_id
  validLogoAssetId: string | null
  // Kokoro TTS runs ~2.5 wps English. voDurationEstimator returns seconds
  // for a given vo_text; the caller can plug real durations from post-synth
  // ffprobe if it wants. Default: words/2.5.
  voDurationEstimator?: (text: string) => number
}

const defaultEstimator = (text: string) => wordCount(text) / 2.5

// Validate a parsed AdScript against the doc §3 rules. Returns [] on pass,
// or a list of specific errors that the repair-retry prompt gets to see.
export function validateAdScript(
  script: unknown,
  ctx: ValidateContext,
): ValidationError[] {
  const errors: ValidationError[] = []
  if (!script || typeof script !== "object") {
    return [{ path: "$", message: "AdScript must be an object" }]
  }
  const s = script as Record<string, unknown>
  const estimator = ctx.voDurationEstimator ?? defaultEstimator

  // template_family
  if (!TEMPLATE_FAMILIES.includes(s.template_family as TemplateFamily)) {
    errors.push({ path: "template_family", message: `must be one of: ${TEMPLATE_FAMILIES.join(", ")}` })
  }
  // aspect_ratio
  if (!ASPECT_RATIOS.includes(s.aspect_ratio as AspectRatio)) {
    errors.push({ path: "aspect_ratio", message: `must be one of: ${ASPECT_RATIOS.join(", ")}` })
  }
  // audio
  const audio = s.audio as Record<string, unknown> | undefined
  if (!audio || typeof audio !== "object") {
    errors.push({ path: "audio", message: "missing audio object" })
  } else {
    if (!VOICES.includes(audio.voice as Voice)) {
      errors.push({ path: "audio.voice", message: `must be one of: ${VOICES.join(", ")}` })
    }
    if (typeof audio.music_id !== "string" || audio.music_id.trim() === "") {
      errors.push({ path: "audio.music_id", message: "required non-empty string" })
    }
    if (!MUSIC_LEVELS.includes(audio.music_level as MusicLevel)) {
      errors.push({ path: "audio.music_level", message: `must be one of: ${MUSIC_LEVELS.join(", ")}` })
    }
  }
  // style
  const style = s.style as Record<string, unknown> | undefined
  if (!style || typeof style !== "object") {
    errors.push({ path: "style", message: "missing style object" })
  } else {
    if (!PALETTE_HINTS.includes(style.palette_hint as PaletteHint)) {
      errors.push({ path: "style.palette_hint", message: `must be one of: ${PALETTE_HINTS.join(", ")}` })
    }
    if (!TEXT_POSITIONS.includes(style.text_position as TextPosition)) {
      errors.push({ path: "style.text_position", message: `must be one of: ${TEXT_POSITIONS.join(", ")}` })
    }
  }
  // scenes
  const scenes = s.scenes
  if (!Array.isArray(scenes)) {
    errors.push({ path: "scenes", message: "must be an array" })
    return errors  // downstream checks all depend on this being an array
  }
  if (scenes.length < SCENE_MIN || scenes.length > SCENE_MAX) {
    errors.push({ path: "scenes", message: `must have ${SCENE_MIN}–${SCENE_MAX} scenes, got ${scenes.length}` })
  }

  let endCardCount = 0
  let totalMin = 0
  let totalDerived = 0

  scenes.forEach((raw, idx) => {
    const path = `scenes[${idx}]`
    if (!raw || typeof raw !== "object") {
      errors.push({ path, message: "scene must be an object" })
      return
    }
    const sc = raw as Record<string, unknown>
    if (!SCENE_TYPES.includes(sc.type as SceneType)) {
      errors.push({ path: `${path}.type`, message: `must be one of: ${SCENE_TYPES.join(", ")}` })
      return
    }
    const minSec = typeof sc.min_seconds === "number" ? sc.min_seconds : NaN
    if (!Number.isFinite(minSec) || minSec < 1) {
      errors.push({ path: `${path}.min_seconds`, message: "must be a positive number" })
    } else {
      totalMin += minSec
    }

    if (sc.type === "end_card") {
      endCardCount++
      if (idx !== scenes.length - 1) {
        errors.push({ path, message: "end_card must be the last scene" })
      }
      const lines = sc.lines
      if (!Array.isArray(lines) || lines.length === 0) {
        errors.push({ path: `${path}.lines`, message: "must be a non-empty array" })
      } else {
        lines.forEach((line, li) => {
          if (typeof line !== "string" || line.length > CHAR_CAP_END_CARD_LINE) {
            errors.push({ path: `${path}.lines[${li}]`, message: `each line ≤ ${CHAR_CAP_END_CARD_LINE} chars` })
          }
        })
      }
      if (sc.logo_asset_id !== undefined && typeof sc.logo_asset_id === "string" && sc.logo_asset_id !== ctx.validLogoAssetId) {
        errors.push({ path: `${path}.logo_asset_id`, message: "must match business.logoAssetId or be omitted" })
      }
      const vo = typeof sc.vo_text === "string" ? sc.vo_text : ""
      if (vo && wordCount(vo) > VO_WORD_CAP) {
        errors.push({ path: `${path}.vo_text`, message: `≤ ${VO_WORD_CAP} words` })
      }
      totalDerived += Math.max(minSec, vo ? estimator(vo) + 0.5 : 0)
      return
    }

    // hook | benefit | cta
    const text = typeof sc.text === "string" ? sc.text : ""
    const cap =
      sc.type === "hook" ? WORD_CAP_HOOK :
      sc.type === "benefit" ? WORD_CAP_BENEFIT :
      WORD_CAP_CTA
    if (!text || wordCount(text) > cap) {
      errors.push({ path: `${path}.text`, message: `≤ ${cap} words, non-empty` })
    }
    const vo = typeof sc.vo_text === "string" ? sc.vo_text : ""
    if (!vo || wordCount(vo) > VO_WORD_CAP) {
      errors.push({ path: `${path}.vo_text`, message: `required, ≤ ${VO_WORD_CAP} words` })
    }
    if (typeof sc.asset_id !== "string" || !ctx.validAssetIds.has(sc.asset_id)) {
      errors.push({ path: `${path}.asset_id`, message: "must be an asset_id from this business's photos" })
    }
    if (!MOTIONS.includes(sc.motion as Motion)) {
      errors.push({ path: `${path}.motion`, message: `must be one of: ${MOTIONS.join(", ")}` })
    }
    totalDerived += Math.max(minSec, vo ? estimator(vo) + 0.5 : minSec)
  })

  if (endCardCount !== 1) {
    errors.push({ path: "scenes", message: `must have exactly one end_card (found ${endCardCount})` })
  }

  if (totalDerived < TOTAL_MIN_SEC || totalDerived > TOTAL_MAX_SEC) {
    errors.push({
      path: "scenes",
      message: `derived total duration ${totalDerived.toFixed(1)}s must be ${TOTAL_MIN_SEC}–${TOTAL_MAX_SEC}s`,
    })
  }
  void totalMin  // unused for now — kept for future analytics

  return errors
}

export function isValid(script: unknown, ctx: ValidateContext): script is AdScript {
  return validateAdScript(script, ctx).length === 0
}
