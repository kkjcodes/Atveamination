import { falAny } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import {
  SCRAPBOOK_MODELS,
  RIFE_TARGET_FPS,
  RIFE_CLIP_SECONDS,
} from "@/lib/scrapbook/config"

// Subtle route: RIFE natively interpolates between two images and (with
// output_type="video") returns a playable clip. Roughly 5-10× cheaper than
// WAN FLF2V. Only valid when motion_class is "subtle" (posing, smiling,
// hugging) — classical interpolators warp pixels and produce ghosting when
// content travels across the frame.
//
// Per fal RIFE API docs:
//   input:  { start_image_url, end_image_url, output_type: "video",
//             num_frames (between the two), fps, include_start, include_end }
//   output: { video: { url } }
//
// num_frames is INTERMEDIATE frames — include_start/end add the two keyframes.
// Total playable frames = num_frames + 2. For a 3s clip at 24fps we want
// ~72 total frames → num_frames = 70.

type FalVideoResult = { video?: { url: string } }

// fal-ai/rife caps num_frames at 64 (intermediate frames only — plus 2
// boundaries = 66 total). 3s @ 24fps wants 70 intermediates and gets
// rejected with a 422, silently degrading every page to the Ken Burns
// fallback. Cap at 64; at RIFE_TARGET_FPS=24 that's ~2.75s of playable
// motion, which the assemble step stretches by holding the last frame.
const RIFE_MAX_NUM_FRAMES = 64

function computeNumFrames(clipSeconds: number, fps: number): number {
  const total = Math.round(clipSeconds * fps)
  return Math.max(2, Math.min(RIFE_MAX_NUM_FRAMES, total - 2))
}

// Keyframes now arrive at matching dimensions because stylize.ts forces
// aspect_ratio="1:1" on Kontext AND center-crops the source to square before
// img2img. RIFE accepts them directly, no normalization needed.
export async function generateSubtleClip(
  beforeUrl: string,
  afterUrl: string,
  projectId: string,
  pageIndex: number,
): Promise<string> {
  const result = await falAny.subscribe(SCRAPBOOK_MODELS.rife, {
    input: {
      start_image_url: beforeUrl,
      end_image_url: afterUrl,
      output_type: "video",
      num_frames: computeNumFrames(RIFE_CLIP_SECONDS, RIFE_TARGET_FPS),
      fps: RIFE_TARGET_FPS,
      include_start: true,
      include_end: true,
    },
  }) as { data: FalVideoResult }

  const url = result.data.video?.url
  if (!url) {
    throw new Error(`No video URL in RIFE result: ${JSON.stringify(Object.keys(result.data))}`)
  }
  return await mirrorUrlToBlob(url, `scrapbook/${projectId}/pages/${pageIndex}/raw_clip.mp4`)
}
