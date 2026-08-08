// WAN i2v runs at ~16 fps and requires num_frames between 81 and 100 per call
// (81 = 1 billing unit, 82-100 = 1.25× billing per fal docs). To deliver scenes
// longer than one call (~6.25s) we chain multiple calls, extracting the last
// frame of clip N as the input image for clip N+1. This module owns the
// mapping from a scene's target duration → per-chunk frame counts.
//
// Frames-per-second: WAN outputs at 16 fps. The final concat trims to the
// exact target duration, so a small overshoot (e.g. 3s scene → 5.06s clip
// trimmed to 3s) is fine. Prefer fewer, larger chunks — each chunk costs one
// full WAN request.

export type ChunkPlan = {
  framesPerChunk: number[]
  targetSeconds: number
}

const FPS = 16
const MIN_FRAMES_PER_CHUNK = 81  // fal WAN i2v hard minimum — anything less returns 422
const MAX_FRAMES_PER_CHUNK = 100

function framesFor(seconds: number): number {
  return Math.min(MAX_FRAMES_PER_CHUNK, Math.max(MIN_FRAMES_PER_CHUNK, Math.round(seconds * FPS)))
}

export function chunkPlanForDuration(durationSeconds: number | null | undefined): ChunkPlan {
  const target = typeof durationSeconds === "number" && durationSeconds > 0 ? durationSeconds : 6
  if (target <= 6.25) {
    return { framesPerChunk: [framesFor(target)], targetSeconds: target }
  }
  const chunks: number[] = []
  let remaining = target
  while (remaining > 6.25) {
    chunks.push(MAX_FRAMES_PER_CHUNK)
    remaining -= 6.25
  }
  chunks.push(framesFor(remaining))
  return { framesPerChunk: chunks, targetSeconds: target }
}

// Audio-aware plan: generate only the frames the narration needs. The concat
// trims every clip to audioDur + 0.5s anyway, so frames past that point were
// paid for (82-100 frames bill at 1.25×) and thrown away. Conservative 2.2
// words/sec (the hi/es Kokoro rate — slower than English) so we never come up
// short; only ever SHORTENS the target — long narration is speed-capped and
// faded to the scene target elsewhere, never extended here.
//
// Every call site (submit, chunk chaining, trim targets) must use the same
// function with the same inputs or chunk indexing breaks mid-scene.
const SPEECH_WPS_CONSERVATIVE = 2.2
const AUDIO_PAD_SEC = 0.5

export function chunkPlanForScene(
  durationSeconds: number | null | undefined,
  ttsText: string | null | undefined,
): ChunkPlan {
  const target = typeof durationSeconds === "number" && durationSeconds > 0 ? durationSeconds : 6
  const words = (ttsText ?? "").trim().split(/\s+/).filter(Boolean).length
  if (words === 0) return chunkPlanForDuration(target)
  const estimated = words / SPEECH_WPS_CONSERVATIVE + AUDIO_PAD_SEC
  return chunkPlanForDuration(Math.min(target, estimated))
}
