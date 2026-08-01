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
