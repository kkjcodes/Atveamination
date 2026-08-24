import { createHash } from "crypto"
import { prisma } from "@/lib/db/client"
import { uploadBlob, mirrorUrlToBlob } from "@/lib/storage/client"
import ffmpeg from "fluent-ffmpeg"
import ffmpegStatic from "ffmpeg-static"
import { join } from "path"
import { promises as fs } from "fs"
import { tmpdir } from "os"
import type { Voice } from "@/lib/business/adscript-schema"
import { ffprobeBinary } from "@/lib/paths"
import { synthesizeKokoro } from "@/lib/kokoro/synth"
import { applyPronunciationLexicon } from "@/lib/business/pronunciation-lexicon"

if (ffmpegStatic) ffmpeg.setFfmpegPath(ffmpegStatic)
ffmpeg.setFfprobePath(ffprobeBinary())

// AdScript's 4 archetypal voices → pinned American-English Kokoro voice IDs.
// All four are American accents so a single ad never mixes accents. Earlier
// the "calm_m" slot pointed at bm_george (British) which put an odd British
// tag on otherwise-American ads.
export const VOICE_MAP: Record<Voice, string> = {
  warm_f:      "af_heart",     // "Warm & friendly"
  confident_m: "am_michael",   // "Deep & authoritative"
  energetic_f: "af_sarah",     // "Upbeat & expressive"
  calm_m:      "am_puck",      // "Formal & refined" — American, calm register
}

// Human-friendly labels for the voice picker UI. Kept next to VOICE_MAP so
// picker UI and TTS synth agree on the same source of truth.
export const VOICE_LABELS: Record<Voice, { name: string; vibe: string }> = {
  warm_f:      { name: "Warm and friendly",   vibe: "Bakery, cafe, salon" },
  confident_m: { name: "Deep and calm",       vibe: "Real estate, legal, dentist" },
  energetic_f: { name: "Upbeat and expressive", vibe: "Fitness, retail launch, kids' events" },
  calm_m:      { name: "Formal and refined",  vibe: "Consultancy, financial, luxury" },
}

const ENGINE = "kokoro"
const TTS_TIMEOUT_MS = 150_000

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} (waited ${Math.round(ms / 1000)}s)`)), ms)
    p.then(
      (v) => { clearTimeout(t); resolve(v) },
      (e) => { clearTimeout(t); reject(e) },
    )
  })
}

function contentHash(engine: string, voiceId: string, text: string): string {
  return createHash("sha256")
    .update(engine).update("|")
    .update(voiceId).update("|")
    .update(text.trim())
    .digest("hex")
    .slice(0, 32)  // 128 bits — plenty for a cache key
}

async function probeDuration(localPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(localPath, (err, meta) => {
      if (err) return reject(err)
      resolve(meta.format.duration ?? 0)
    })
  })
}

export type SynthResult = {
  audioUrl: string
  durationSec: number
  cached: boolean
}

// Build the actual TTS input from canonical vo_text. Two transforms, both
// TTS-only (captions render from the untouched vo_text):
//   1. pronunciation_hint from the script model. Format: "Nguyen's -> Win's"
//      → replace LHS with RHS.
//   2. Pronunciation lexicon → inline phoneme markup. English voices only:
//      the hindi/spanish Kokoro endpoints read the markup literally.
// Exported for tests. Called before hashing, so a lexicon change naturally
// re-synthesizes affected clips instead of serving stale cached audio.
export function prepareTtsInput(voiceId: string, text: string, pronunciationHint?: string): string {
  let ttsInput = text.trim()
  if (pronunciationHint) {
    const arrow = pronunciationHint.split(/->|→/)
    if (arrow.length === 2) {
      const lhs = arrow[0].trim()
      const rhs = arrow[1].trim()
      if (lhs && rhs) ttsInput = ttsInput.split(lhs).join(rhs)
    }
  }
  const prefix = voiceId.slice(0, 2).toLowerCase()
  const isEnglishVoice = prefix === "af" || prefix === "am" || prefix === "bf" || prefix === "bm"
  if (isEnglishVoice) ttsInput = applyPronunciationLexicon(ttsInput)
  return ttsInput
}

// The M3/M4 payoff: an edit that changes ONE vo_text re-synths ONE clip, not
// five. Cache hit skips the fal call entirely; cache miss uploads to blob
// AND stores the row so the next call reuses it.
export async function synthesize(voice: Voice, text: string, pronunciationHint?: string): Promise<SynthResult> {
  const voiceId = VOICE_MAP[voice]
  if (!voiceId) throw new Error(`Unknown voice archetype: ${voice}`)

  // Growth signal for the lexicon: the script model reaching for a hint
  // means it hit a word it expects TTS to fumble — audition it (see
  // pronunciation-lexicon.ts header) and promote it to the dictionary.
  if (pronunciationHint) console.log(`[tts] pronunciation_hint used: ${pronunciationHint}`)
  const ttsInput = prepareTtsInput(voiceId, text, pronunciationHint)

  const hash = contentHash(ENGINE, voiceId, ttsInput)

  const existing = await prisma.ttsCache.findUnique({ where: { contentHash: hash } })
  if (existing) {
    return { audioUrl: existing.audioUrl, durationSec: existing.durationSec, cached: true }
  }

  // Bound the fal call. A congested Kokoro queue has left renders stuck at
  // phase-1 TTS indefinitely — better to fail the render with a retryable
  // error than sit in status="rendering" until the stale reclaim window.
  const { audioUrl: rawUrl } = await withTimeout(
    synthesizeKokoro(voiceId, ttsInput),
    TTS_TIMEOUT_MS,
    "The voice service is taking too long right now",
  )

  const blobPath = `business/tts-cache/${hash}.wav`
  const audioUrl = await mirrorUrlToBlob(rawUrl, blobPath)

  // Probe duration by downloading the just-uploaded blob. We could probe the
  // fal CDN URL directly, but blob has stable auth so this is more robust.
  const tmp = join(tmpdir(), `atve_tts_probe_${hash}.wav`)
  try {
    const res = await fetch(audioUrl)
    await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()))
    const durationSec = await probeDuration(tmp)
    await prisma.ttsCache.create({
      data: { contentHash: hash, engine: ENGINE, voiceId, text: ttsInput, audioUrl, blobPath, durationSec },
    })
    return { audioUrl, durationSec, cached: false }
  } finally {
    await fs.unlink(tmp).catch(() => {})
  }
}

// Batch helper — parallelizes cache lookups but serializes fal calls for
// misses (fal ratelimit is friendlier this way + cost-transparent).
export async function synthesizeMany(
  items: Array<{ voice: Voice; text: string; pronunciationHint?: string }>,
): Promise<SynthResult[]> {
  const results: SynthResult[] = []
  for (const item of items) {
    results.push(await synthesize(item.voice, item.text, item.pronunciationHint))
  }
  return results
}

// Used indirectly to prime a manual-audition asset (the M3b PR gate says
// "outputs attached to the PR"). Not called from prod paths.
export async function auditionVoice(voice: Voice): Promise<SynthResult> {
  return synthesize(voice, "This is your voice archetype speaking a sample line for audition.")
}

// re-export for the (future) OpenAI-fallback path.
export { uploadBlob }
