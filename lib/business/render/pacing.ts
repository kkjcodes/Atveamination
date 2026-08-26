import type { Motion } from "@/lib/business/adscript-schema"

// Pacing grammar (P3): the 2026 short-ad rhythm is cuts every ~2.5-3s,
// aligned to the soundtrack's beat. Two pure helpers, wired into renderAd:
//
// 1. Beat snapping — scene boundaries land on a beat of the selected track
//    (the music catalog stores measured BPM per track). Durations only ever
//    grow to the next beat, never shrink: narration must never be cut.
// 2. Scene splitting — a photo scene held longer than SPLIT_THRESHOLD_SEC
//    renders as two sub-shots of the same photo with contrasting motion,
//    doubling the cut rate without new assets or API calls.

export const SPLIT_THRESHOLD_SEC = 5

// Snap each duration UP to the nearest beat multiple. Only meaningful beat
// lengths are used — outside 40-200 BPM we leave durations untouched (bad
// tag data shouldn't warp the ad).
export function snapDurationsToBeat(durations: number[], bpm: number | null | undefined): number[] {
  if (!bpm || bpm < 40 || bpm > 200) return durations
  const beat = 60 / bpm
  return durations.map((d) => {
    const beats = Math.ceil((d - 1e-6) / beat)
    return Math.round(beats * beat * 1000) / 1000
  })
}

// The second sub-shot gets a motion that contrasts with the first so the cut
// reads as a deliberate edit, not a stutter.
const CONTRAST: Record<Motion, Motion> = {
  slow_zoom_in: "pan_left",
  slow_zoom_out: "pan_right",
  pan_left: "slow_zoom_in",
  pan_right: "slow_zoom_in",
  hold: "slow_zoom_in",
}

export function contrastMotion(motion: Motion): Motion {
  return CONTRAST[motion] ?? "slow_zoom_in"
}

export function shouldSplitScene(sceneType: string, durationSec: number, isPresenter: boolean): boolean {
  return sceneType !== "end_card" && !isPresenter && durationSec >= SPLIT_THRESHOLD_SEC
}
