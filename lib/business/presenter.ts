import { createHash } from "crypto"
import { fal } from "@/lib/fal/client"
import { mirrorUrlToBlob } from "@/lib/storage/client"

// Cartoon presenter (Phase C1): the user's Character fronts one scene of a
// business ad. Pipeline per lipsync-validation.md:
//   character style image → presenter keyframe (Kontext) → WAN i2v motion
//   → LatentSync lip sync (Replicate) against the scene's narration audio.
//
// All calls are bounded — a congested provider fails the presenter, and the
// caller falls back to rendering the slot as a normal photo scene. "Mouth
// moving wrong" is worse than "no presenter" (same lesson as the LatentSync
// shared-scene skip rule), so ANY failure or timeout falls back silently.

// Styles offered in the presenter picker. From the C0 bench of 2026-08-06
// (lipsync-validation.md) + Kumar's review: 6/8 passed technically; Kumar cut
// claymation (over-smiling read as off-brand). ghibli + chibi failed
// LatentSync face detection (chibi: proportions; ghibli: soft features).
// Ineligible styles show "can't present yet" in the UI. Update after reruns.
export const PRESENTER_ELIGIBLE_STYLES: readonly string[] = [
  "pixar",
  "anime",
  "comic",
  "sketch",
  "watercolor",
]

export function isPresenterEligibleStyle(style: string | null | undefined): boolean {
  return !!style && PRESENTER_ELIGIBLE_STYLES.includes(style)
}

// Composition matters more than it looks: the C0 bench failed across ALL
// styles when WAN cover-cropped a portrait keyframe into 16:9 and cut the
// head out of frame — LatentSync then throws "Face not detected". The
// keyframe is generated AT 16:9 with explicit full-head framing, and the
// motion prompt re-asserts it.
export const PRESENTER_KEYFRAME_PROMPT =
  "Reframe this character as a television presenter in a 16:9 medium shot: head and shoulders centered, the ENTIRE head fully in frame with generous headroom above the hair, facing the camera directly, warm professional smile, hands relaxed out of frame, plain softly-lit background. Keep the exact same art style and the exact same character."

export const PRESENTER_MOTION_PROMPT =
  "animated cartoon presenter speaking directly to camera, entire head and face fully visible in frame at all times, natural mouth movement while talking, gentle head movement, stable camera, illustrated background"

export const PRESENTER_MOTION_NEGATIVE =
  "photorealistic, live action, shaky camera, motion blur, extra people, distorted face"

// Cache key: the presenter clip only depends on the keyframe + spoken line.
export function presenterLineHash(characterId: string, voText: string): string {
  return createHash("sha256").update(characterId).update("|").update(voText.trim()).digest("hex").slice(0, 32)
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    p.then((v) => { clearTimeout(t); resolve(v) }, (e) => { clearTimeout(t); reject(e) })
  })
}

const KEYFRAME_TIMEOUT_MS = 90_000
const WAN_TIMEOUT_MS = 240_000
const LIPSYNC_TIMEOUT_MS = 180_000

// Step 1: presenter keyframe from the character's selected style image.
// No LoRA required — Kontext edits the existing style image, so this works
// ~2 minutes after a selfie upload.
export async function generatePresenterKeyframe(styleImageUrl: string, adId: string): Promise<string> {
  const result = await withTimeout(
    fal.subscribe("fal-ai/flux-pro/kontext", {
      input: { prompt: PRESENTER_KEYFRAME_PROMPT, image_url: styleImageUrl, aspect_ratio: "16:9" } as never,
    }),
    KEYFRAME_TIMEOUT_MS,
    "Presenter keyframe",
  )
  const d = result.data as { images?: Array<{ url?: string }> }
  const url = d?.images?.[0]?.url
  if (!url) throw new Error("Presenter keyframe returned no image")
  return mirrorUrlToBlob(url, `business/ads/${adId}/presenter-keyframe.jpg`)
}

// Step 2: WAN i2v talking-motion clip from the keyframe (16:9, ~6s).
export async function generatePresenterMotion(keyframeUrl: string): Promise<string> {
  const result = await withTimeout(
    fal.subscribe("fal-ai/wan-i2v", {
      input: {
        prompt: PRESENTER_MOTION_PROMPT,
        negative_prompt: PRESENTER_MOTION_NEGATIVE,
        image_url: keyframeUrl,
        resolution: "720p",
        aspect_ratio: "16:9",
        num_frames: 100,
        guide_scale: 8,
      } as never,
    }),
    WAN_TIMEOUT_MS,
    "Presenter motion",
  )
  const d = result.data as { video?: { url?: string } }
  const url = d?.video?.url
  if (!url) throw new Error("Presenter motion returned no video")
  return url
}

// Step 3: LatentSync via Replicate (v1 provider per lipsync-validation.md).
export async function lipSyncPresenter(
  videoUrl: string,
  audioUrl: string,
  replicateToken: string,
): Promise<string> {
  const H = { Authorization: `Bearer ${replicateToken}`, "Content-Type": "application/json" }
  const run = async (): Promise<string> => {
    const m = await (await fetch("https://api.replicate.com/v1/models/bytedance/latentsync", { headers: H })).json() as { latest_version?: { id?: string } }
    const version = m.latest_version?.id
    if (!version) throw new Error("LatentSync version lookup failed")
    const p = await (await fetch("https://api.replicate.com/v1/predictions", {
      method: "POST", headers: H,
      body: JSON.stringify({ version, input: { video: videoUrl, audio: audioUrl } }),
    })).json() as { id?: string }
    if (!p.id) throw new Error("LatentSync submit failed")
    for (;;) {
      await new Promise((r) => setTimeout(r, 5000))
      const s = await (await fetch(`https://api.replicate.com/v1/predictions/${p.id}`, { headers: H })).json() as { status?: string; output?: unknown; error?: string }
      if (s.status === "succeeded") {
        const out = s.output
        const url = typeof out === "string" ? out : (out as { url?: string })?.url ?? (Array.isArray(out) ? out[0] : null)
        if (!url) throw new Error("LatentSync returned no output url")
        return url as string
      }
      if (s.status === "failed" || s.status === "canceled") throw new Error(`LatentSync ${s.status}: ${s.error ?? ""}`)
    }
  }
  return withTimeout(run(), LIPSYNC_TIMEOUT_MS, "Lip sync")
}

export type PresenterClipResult = {
  clipUrl: string       // blob-mirrored synced clip
  keyframeUrl: string   // blob-mirrored keyframe
  lineHash: string
}

// Full chain with caching hooks. Throws on any failure — the caller decides
// the fallback (render the slot as a normal photo scene).
export async function generatePresenterClip(opts: {
  adId: string
  characterId: string
  styleImageUrl: string
  voText: string
  voAudioUrl: string          // the scene's already-synthesized narration
  replicateToken: string
  cached?: { clipUrl: string | null; keyframeUrl: string | null; lineHash: string | null }
}): Promise<PresenterClipResult> {
  const lineHash = presenterLineHash(opts.characterId, opts.voText)
  if (opts.cached?.clipUrl && opts.cached.lineHash === lineHash) {
    return { clipUrl: opts.cached.clipUrl, keyframeUrl: opts.cached.keyframeUrl ?? "", lineHash }
  }
  const keyframeUrl = opts.cached?.keyframeUrl || await generatePresenterKeyframe(opts.styleImageUrl, opts.adId)
  const motionUrl = await generatePresenterMotion(keyframeUrl)
  const syncedUrl = await lipSyncPresenter(motionUrl, opts.voAudioUrl, opts.replicateToken)
  const clipUrl = await mirrorUrlToBlob(syncedUrl, `business/ads/${opts.adId}/presenter-${lineHash}.mp4`)
  return { clipUrl, keyframeUrl, lineHash }
}


// Which scene the presenter fronts (pure — pinned by unit tests; the CTA
// slot had no dedicated coverage until 2026-08-26). "hook" = first content
// scene, "cta" = last content scene; end cards are never presenter slots.
export function presenterSlotIndex(
  scenes: Array<{ type: string }>,
  slot: "hook" | "cta",
): number {
  const nonEnd = scenes
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.type !== "end_card")
  if (nonEnd.length === 0) return -1
  return slot === "cta" ? nonEnd[nonEnd.length - 1].i : nonEnd[0].i
}
