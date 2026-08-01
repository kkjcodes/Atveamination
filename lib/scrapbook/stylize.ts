import { falAny } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"
import {
  SCRAPBOOK_MODELS,
  STYLE_PRESETS,
  IMG2IMG_STRENGTH,
  type ScrapbookStyle,
} from "@/lib/scrapbook/config"
import type { ShotPlan } from "@/lib/scrapbook/models"

// Stage 2a/2b: stylized before/after keyframes via fal.ai.
//
// Design: BEFORE keyframe is style-transfer of the ORIGINAL photo (FLUX
// img2img with strength ~0.6 — high enough to switch style, low enough to
// preserve composition and identity). AFTER keyframe is an EDIT of the
// before-keyframe using the shot plan's after_frame_prompt (FLUX Kontext).
// Editing the stylized frame preserves identity/style far better than
// generating fresh from prompt.
//
// Aspect: both keyframes are forced to 1:1. Kontext's default aspect drifts
// from img2img (which mirrors input dimensions) — that mismatch was the root
// cause of the RIFE dimension-mismatch fallback. Forcing 1:1 on both makes
// the pair size-consistent AND matches the parchment page layout (square).
// Source photo is center-cropped to square before img2img so no re-normalize
// step is needed after generation.
const SCRAPBOOK_ASPECT = "1:1" as const

type FalImageResult = {
  images?: Array<{ url: string; width?: number; height?: number }>
  // Some endpoints return a single `image.url` — fallback below covers it.
  image?: { url: string }
}

function firstImageUrl(result: FalImageResult, model: string): string {
  const url = result.images?.[0]?.url ?? result.image?.url
  if (!url) {
    throw new Error(`No image URL in ${model} result: ${JSON.stringify(Object.keys(result))}`)
  }
  return url
}

// Generate the "before" keyframe: style-transfer the original photo. The
// resulting URL is mirrored to blob so the fal-hosted CDN URL (which expires)
// isn't the canonical reference.
//
// Per @fal-ai/client BaseImageToInput: image_url (required), prompt (required),
// strength (default 0.95), num_inference_steps (default 40), guidance_scale
// (default 3.5). No aspect_ratio or image_size param — output dimensions
// mirror the input. Source photo is expected to be pre-cropped square (see
// centerCropToSquare below).
export async function generateBeforeKeyframe(
  sourcePhotoUrl: string,
  shotPlan: ShotPlan,
  style: ScrapbookStyle,
  projectId: string,
  pageIndex: number,
): Promise<string> {
  const preset = STYLE_PRESETS[style]
  // Prompt combines the before_frame_prompt (which already includes the
  // style fragment) with an explicit reminder — the shot plan is the truth
  // for THIS photo; the preset is the truth for the whole scrapbook.
  const prompt = `${shotPlan.before_frame_prompt} Style: ${preset.prompt}.`

  // Center-crop the source to square first so both img2img (mirrors input)
  // and Kontext (with aspect_ratio="1:1") produce identical dimensions.
  const squareUrl = await centerCropToSquare(sourcePhotoUrl, projectId, pageIndex)

  const result = await falAny.subscribe(SCRAPBOOK_MODELS.fluxImg2Img, {
    input: {
      image_url: squareUrl,
      prompt,
      strength: IMG2IMG_STRENGTH,
      num_inference_steps: 30,
      guidance_scale: 3.5,
    },
  }) as { data: FalImageResult }

  const rawUrl = firstImageUrl(result.data, SCRAPBOOK_MODELS.fluxImg2Img)
  return await mirrorUrlToBlob(rawUrl, `scrapbook/${projectId}/pages/${pageIndex}/before.jpg`)
}

// Generate the "after" keyframe: FLUX Kontext edit of the before-keyframe.
// This is what makes RIFE/WAN FLF2V produce clean motion — the two frames
// share style AND identity because they came from the same visual seed.
//
// Per @fal-ai/client FluxKontextInput: image_url (required), prompt (required),
// aspect_ratio (optional; drives output dimensions), guidance_scale (default 3.5).
// We pass aspect_ratio="1:1" explicitly — Kontext's default drifts from
// img2img, which caused every subtle-motion page to hit RIFE dim-mismatch and
// fall back to Ken Burns. Forcing 1:1 on both keeps them size-matched.
export async function generateAfterKeyframe(
  beforeKeyframeUrl: string,
  shotPlan: ShotPlan,
  style: ScrapbookStyle,
  projectId: string,
  pageIndex: number,
): Promise<string> {
  const preset = STYLE_PRESETS[style]
  // The Kontext prompt has to be an EDIT instruction, not a fresh generation
  // prompt. Emphasize preservation of everything except the action.
  const prompt = `Advance this scene 1-2 seconds within the SAME action: ${shotPlan.after_frame_prompt}. Keep the same people, same clothing, same camera angle, same art style (${preset.prompt}), same setting. Only the action progresses.`

  const result = await falAny.subscribe(SCRAPBOOK_MODELS.fluxKontext, {
    input: {
      image_url: beforeKeyframeUrl,
      prompt,
      aspect_ratio: SCRAPBOOK_ASPECT,
      guidance_scale: 3.5,
    },
  }) as { data: FalImageResult }

  const rawUrl = firstImageUrl(result.data, SCRAPBOOK_MODELS.fluxKontext)
  return await mirrorUrlToBlob(rawUrl, `scrapbook/${projectId}/pages/${pageIndex}/after.jpg`)
}

// Center-crop the source photo to a 1024×1024 square and upload as a stable
// blob. Square + fixed 1024 side is the interlock: Kontext's aspect_ratio="1:1"
// returns 1024×1024, img2img mirrors input dimensions, so pre-sizing the input
// to 1024×1024 makes every downstream frame the same exact size and RIFE
// accepts them without a normalization step. (Bigger source photos previously
// produced 1968×1968 img2img outputs that RIFE 422'd against 1024×1024 Kontext.)
const CANONICAL_SIDE = 1024

async function centerCropToSquare(
  sourcePhotoUrl: string,
  projectId: string,
  pageIndex: number,
): Promise<string> {
  const { default: sharp } = await import("sharp")
  const { uploadBlob } = await import("@/lib/storage/client")
  const buf = Buffer.from(await (await fetch(sourcePhotoUrl)).arrayBuffer())
  const cropped = await sharp(buf)
    .resize(CANONICAL_SIDE, CANONICAL_SIDE, { fit: "cover", position: "center" })
    .jpeg({ quality: 92 })
    .toBuffer()
  return await uploadBlob(`scrapbook/${projectId}/pages/${pageIndex}/source_square.jpg`, cropped, "image/jpeg")
}
