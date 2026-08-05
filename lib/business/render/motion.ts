import type { Motion } from "@/lib/business/adscript-schema"
import { OUTPUT_FPS } from "@/lib/business/render/dimensions"

// Motion vocabulary → ffmpeg video filter chain. Kept intentionally small
// (per BUSINESS-FORK-HANDOFF.md §5) so renders stay predictable.
//
// All chains follow the same shape:
//   1. Normalize the photo to the output aspect at 2x (avoids zoompan jitter —
//      same trick as scrapbook Ken Burns): blurred cover copy fills the frame,
//      the full photo sits contained on top. The zoompan crop window keeps the
//      source image's aspect ratio, so feeding it an un-normalized landscape
//      photo on a 9:16 output stretched everything vertically.
//   2. Apply the motion via `zoompan`.
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
  const fillW = workW * 2
  const fillH = workH * 2

  // Blur-fill normalize: photo shown whole and undistorted, blurred cover
  // copy behind it fills whatever the photo's aspect leaves empty.
  //
  // The leading trim=end_frame=1 is the render-speed lever: scene.ts feeds a
  // `-loop 1` still, which streams the SAME image at 30fps — without the trim
  // the whole 2x-resolution blur/overlay composite re-runs for every output
  // frame (measured minutes per scene on the 1-vCPU prod container). Trimming
  // to one frame runs normalize ONCE; zoompan then synthesizes all `frames`
  // output frames from that single normalized frame (d= is per input frame).
  const normalize = [
    `trim=end_frame=1,split=2[mf_bg][mf_fg]`,
    `[mf_bg]scale=${fillW}:${fillH}:force_original_aspect_ratio=increase,crop=${fillW}:${fillH},boxblur=32:2[mf_bgb]`,
    `[mf_fg]scale=${fillW}:${fillH}:force_original_aspect_ratio=decrease[mf_fgs]`,
    `[mf_bgb][mf_fgs]overlay=(W-w)/2:(H-h)/2,setsar=1`,
  ].join(";")

  switch (motion) {
    case "slow_zoom_in": {
      // 1.0 → 1.08 across the scene.
      return [
        normalize,
        `zoompan=z='min(1.0+0.08*on/${frames},1.08)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${workW}x${workH}:fps=${OUTPUT_FPS}`,
        `scale=${outWidth}:${outHeight}`,
      ].join(",")
    }
    case "slow_zoom_out": {
      // 1.08 → 1.0.
      return [
        normalize,
        `zoompan=z='max(1.08-0.08*on/${frames},1.0)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${workW}x${workH}:fps=${OUTPUT_FPS}`,
        `scale=${outWidth}:${outHeight}`,
      ].join(",")
    }
    case "pan_left": {
      // Image scaled 1.1x horizontally; crop travels right → left.
      return [
        normalize,
        `zoompan=z=1.1:x='iw*0.05+iw*0.1*(1-on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=${workW}x${workH}:fps=${OUTPUT_FPS}`,
        `scale=${outWidth}:${outHeight}`,
      ].join(",")
    }
    case "pan_right": {
      return [
        normalize,
        `zoompan=z=1.1:x='iw*0.05+iw*0.1*(on/${frames})':y='ih/2-(ih/zoom/2)':d=${frames}:s=${workW}x${workH}:fps=${OUTPUT_FPS}`,
        `scale=${outWidth}:${outHeight}`,
      ].join(",")
    }
    case "hold": {
      // No motion — zoompan at z=1 replays the single normalized frame so the
      // one-frame trim works here too.
      return [
        normalize,
        `zoompan=z=1:x=0:y=0:d=${frames}:s=${workW}x${workH}:fps=${OUTPUT_FPS}`,
        `scale=${outWidth}:${outHeight}`,
      ].join(",")
    }
  }
}
