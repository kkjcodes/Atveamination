// TypeScript types matching the Python spec's dataclasses. These are stored
// as JSON on ScrapbookPage rows (shotPlan, qcResult).

export type MotionClass = "subtle" | "dynamic"

// Extracted by Sonnet from a source photo. The `after_frame_prompt`
// constraint (same angle/subjects/setting, action progressed 1-2s) is
// load-bearing for RIFE and WAN FLF2V to work.
export type ShotPlan = {
  subjects: string
  action: string
  setting: string
  before_frame_prompt: string
  after_frame_prompt: string
  motion_prompt: string
  caption: string          // ≤ 8 words, scrapbook tone
  motion_class: MotionClass
}

const SHOT_PLAN_REQUIRED = [
  "subjects", "action", "setting", "before_frame_prompt",
  "after_frame_prompt", "motion_prompt", "caption", "motion_class",
] as const

// Defensively coerce a parsed JSON object into a ShotPlan. Missing fields
// throw; motion_class defaults to "subtle" (cheaper + safer) on unknown value.
export function parseShotPlan(raw: unknown): ShotPlan {
  if (!raw || typeof raw !== "object") {
    throw new Error("ShotPlan input is not an object")
  }
  const obj = raw as Record<string, unknown>
  const missing = SHOT_PLAN_REQUIRED.filter((k) => {
    const v = obj[k]
    return typeof v !== "string" || v.trim() === ""
  })
  if (missing.length > 0) {
    throw new Error(`ShotPlan missing fields: ${missing.join(", ")}`)
  }
  const motion = String(obj.motion_class).trim().toLowerCase()
  const motion_class: MotionClass = motion === "dynamic" ? "dynamic" : "subtle"
  return {
    subjects:            String(obj.subjects).trim(),
    action:              String(obj.action).trim(),
    setting:             String(obj.setting).trim(),
    before_frame_prompt: String(obj.before_frame_prompt).trim(),
    after_frame_prompt:  String(obj.after_frame_prompt).trim(),
    motion_prompt:       String(obj.motion_prompt).trim(),
    caption:             String(obj.caption).trim(),
    motion_class,
  }
}

export type QCResult = {
  passed: boolean
  reason: string
  metrics: {
    duration?: number
    mean_diff?: number
    max_diff?: number
    firstframe_mse?: number
  }
}
