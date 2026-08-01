import type { Motion } from "@/lib/business/adscript-schema"
import { OUTPUT_FPS } from "@/lib/business/render/dimensions"

// Motion vocabulary → ffmpeg video filter chain. Kept intentionally small
// (per BUSINESS-FORK-HANDOFF.md §5) so renders stay predictable.
//
// All chains follow the same shape:
//   1. Scale image up 2x (avoids zoompan jitter — same trick as scrapbook Ken Burns).
//   2. Apply the motion via `zoompan` or crop pan.
//   3. Scale back down to output dims.
//
// Every filter chain is deterministic for a given (durationSec, width, height)
// so re-renders of the same AdVersion produce byte-identical output.

export function buildMotionFilter(
  motion: Motion,
  durationSec: number,
  outWidth: number,
  outHeight: number,
): string {
  const frames = Math.max(1, Math.round(durationSec * OUTPUT_FPS))
  // Working dimensions (even numbers required by libx264).
  const workW = Math.floor(outWidth / 2) * 2
  const workH = Math.floor(outHeight / 2) * 2

  switch (motion) {
    case "slow_zoom_in": {
      // 1.0 → 1.08 across the scene.
      return [
        "scale=iw*2:ih*2",
        `zoompan=z='min(1.0+0.08*on/${frames},1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${workW}x${workH}:fps=${OUTPUT_FPS}`,
        `scale=${outWidth}:${outHeight}`,
      ].join(",")
    }
    case "slow_zoom_out": {
      // 1.08 → 1.0.
      return [
        "scale=iw*2:ih*2",
        `zoompan=z='max(1.08-0.08*on/${frames},1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${workW}x${workH}:fps=${OUTPUT_FPS}`,
        `scale=${outWidth}:${outHeight}`,
      ].join(",")
    }
    case "pan_left": {
      // Image scaled 1.1x horizontally; crop travels right → left.
      return [
        `scale=iw*2:ih*2`,
        `zoompan=z=1.1:x='iw*0.05+iw*0.1*(1-on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=${workW}x${workH}:fps=${OUTPUT_FPS}`,
        `scale=${outWidth}:${outHeight}`,
      ].join(",")
    }
    case "pan_right": {
      return [
        `scale=iw*2:ih*2`,
        `zoompan=z=1.1:x='iw*0.05+iw*0.1*(on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=${workW}x${workH}:fps=${OUTPUT_FPS}`,
        `scale=${outWidth}:${outHeight}`,
      ].join(",")
    }
    case "hold": {
      // No motion — just scale/pad to output.
      return `scale=${outWidth}:${outHeight}:force_original_aspect_ratio=increase,crop=${outWidth}:${outHeight}`
    }
  }
}
