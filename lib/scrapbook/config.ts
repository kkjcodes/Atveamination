// Central config for the scrapbook pipeline. Model IDs live here so they're
// changed in ONE place when fal.ai deprecates/renames endpoints (per
// feedback_model_migrations.md).
//
// ⚠️ VERIFY tags mark model IDs / request-shape assumptions that are best-guess
// placeholders from the Python spec. Confirm each one before the first live
// test run and update this file (not the call sites).

// All four model IDs verified against fal.ai on 2026-07-16. Request/response
// shapes below match the current API — do NOT re-guess parameter names from
// the Python spec (which had `image_url` for WAN when the real name is
// `first_frame_url`, etc). If fal deprecates any of these, replace the ID
// AND re-verify the schema at https://fal.ai/models/<id>/api.
export const SCRAPBOOK_MODELS = {
  // Sonnet vision for shot-plan extraction. Same identity-critical model we
  // already use for character description (per CLAUDE.md — Sonnet > Haiku for
  // vision-identity work).
  vision: "claude-sonnet-4-6",

  // FLUX img2img — used for the "before" keyframe (style-transfer of the
  // original photo). Takes: image_url, prompt, strength (default 0.95),
  // num_inference_steps (default 40), guidance_scale (default 3.5).
  // Does NOT accept image_size or output_format. Response: { images: [{ url }] }.
  fluxImg2Img: "fal-ai/flux/dev/image-to-image",

  // FLUX Kontext (pro, single image) — used for the "after" keyframe by
  // advancing the same scene 1-2s in style-space. Takes: image_url, prompt,
  // guidance_scale, num_inference_steps. Does NOT accept aspect_ratio or
  // output_format. Response: { images: [{ url }] }.
  fluxKontext: "fal-ai/flux-pro/kontext",

  // WAN 2.1 first-last-frame → video. Param names are `first_frame_url` and
  // `last_frame_url` (NOT `image_url`/`end_image_url`). Takes prompt + optional
  // resolution ("480p"|"720p"). Does NOT accept num_frames or fps.
  // Response: { video: { url } }.
  wanFlf2v: "fal-ai/wan-flf2v",

  // RIFE image-pair interpolation — natively outputs video when
  // output_type="video" is set. Takes: start_image_url, end_image_url,
  // num_frames (between the two), fps, include_start, include_end.
  // Response with output_type=video: { video: { url } }.
  rife: "fal-ai/rife",
} as const

export type ScrapbookStyle = "watercolor" | "pixar" | "crayon"

export const STYLE_PRESETS: Record<ScrapbookStyle, { label: string; prompt: string; description: string }> = {
  watercolor: {
    label: "Watercolor",
    description: "Soft brush strokes, storybook feel",
    prompt: "soft watercolor illustration, gentle brush strokes, pastel palette, storybook style, textured paper feel",
  },
  pixar: {
    label: "Pixar",
    description: "3D animated, warm cinematic lighting",
    prompt: "3D animated film style, Pixar-like rendering, expressive stylized characters, warm cinematic lighting, high detail",
  },
  crayon: {
    label: "Crayon",
    description: "Bold waxy strokes, bright primaries",
    prompt: "children's crayon drawing style, bold waxy strokes, bright primary colors, charming hand-drawn feel",
  },
}

// ── Keyframe generation ─────────────────────────────────────────────────────
export const IMG2IMG_STRENGTH = 0.6  // sweep 0.5-0.7 in testing
export const KEYFRAME_WIDTH = 1280
export const KEYFRAME_HEIGHT = 720

// ── Motion + clip length ────────────────────────────────────────────────────
export const CLIP_SECONDS = 4        // target per-page clip length (WAN may quantize)
export const CLIP_FPS = 24
export const RIFE_TARGET_FPS = 24
export const RIFE_CLIP_SECONDS = 3.0 // stretch RIFE output so motion reads gentle

// ── QC thresholds (see qc.ts) ───────────────────────────────────────────────
export const QC_MIN_DURATION = 2.0
export const QC_MAX_DURATION = 6.5
export const QC_FROZEN_DIFF_THRESHOLD = 1.5   // mean frame diff < this → frozen
export const QC_GLITCH_DIFF_THRESHOLD = 60.0  // single-step diff > this → glitch
export const QC_FIRSTFRAME_MSE_MAX = 4000.0   // 64x64 gray MSE vs before-keyframe

// ── Assembly (page composite + join) ────────────────────────────────────────
export const OUTPUT_WIDTH = 1920
export const OUTPUT_HEIGHT = 1080
export const OUTPUT_FPS = 30
export const PAGE_HOLD_SECONDS = 4.5      // total time each page is visible
export const TRANSITION_SECONDS = 0.5     // xfade duration
export const XFADE_TRANSITION = "wipeleft" // MVP page-turn approximation
export const KENBURNS_SECONDS = 4.0

// ── Cost estimates (per-page, updated as fal returns real pricing metadata) ──
// Used ONLY for UI hints — actual cost is recorded on ScrapbookPage.costUsd
// when each stage completes.
export const COST_ESTIMATES = {
  vision: 0.015,          // Sonnet vision
  fluxImg2Img: 0.03,      // per generation
  fluxKontext: 0.04,      // per generation
  rife: 0.02,             // subtle route interp
  wanFlf2v: 0.40,         // dynamic route
  perPageSubtle: 0.10,    // vision + before + after + rife
  perPageDynamic: 0.50,   // vision + before + after + wan
  perPageFallback: 0.06,  // vision + before only, Ken Burns is free
} as const

export const MAX_PAGES_PER_PROJECT = 8
export const MIN_PAGES_PER_PROJECT = 1

// ── Assets (public/scrapbook/ under Next public dir) ────────────────────────
// Paths are RELATIVE TO /public/. Consumers call publicPath(ASSET_*) to
// resolve to an absolute filesystem path. Keep them as relative strings so
// they're statically analyzable by Turbopack — process.cwd() joins used to
// leak the whole working directory into the standalone trace.
export const ASSET_PAGE_BG = "scrapbook/page_bg.png"
export const ASSET_CAPTION_FONT = "scrapbook/handwriting.ttf"
