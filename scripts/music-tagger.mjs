// Music tagging helpers used by scripts/curate-music.mjs.
//
// Two backends:
//   1. Essentia CLI (optional) — if `essentia_streaming_extractor_music` is
//      on the PATH we use it: research-grade BPM, mood, danceability, key.
//      Install: brew install essentia (Mac) or apt install essentia-tools.
//   2. Local heuristics (default) — ffmpeg for per-frame RMS + HF energy,
//      music-tempo npm for BPM. Zero-config. Good enough for auto-family
//      assignment on obvious tracks; may misclassify ambiguous ones.
//
// The exported functions are pure logic — tagger reads a file path and
// returns a tag bundle. The curate script uses tags to pick slot + family.

import { spawn } from "child_process"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import ffmpegStatic from "ffmpeg-static"
import MusicTempo from "music-tempo"

const FFMPEG = ffmpegStatic

// ── Public API ──────────────────────────────────────────────────────────────

export const MOODS = ["upbeat", "calm", "intense", "peaceful", "warm", "holiday"]
export const FAMILIES = ["clean_modern", "bold_promo", "scrapbook"]

// Tags describe an already-trimmed 45s audio file. Consumed by
// deriveFamily() and deriveSlotSlug() to place the track in the catalog.
// Numeric fields are 0..1 or absolute (BPM). `source` records which backend
// produced the numbers so we can compare quality later.
//
// Shape:
//   { bpm: number, energy: number, brightness: number,
//     dynamics: number, mood: string, source: "essentia" | "local" }

export async function computeTags(filePath) {
  const essentia = await tryEssentia(filePath)
  if (essentia) return { ...essentia, source: "essentia" }
  return { ...(await localTags(filePath)), source: "local" }
}

// Family heuristic — the ONLY code path that decides which of the 3 families
// a track lands in. Kept small + testable.
//
//   bold_promo:   punchy + fast (upbeat / intense)
//   clean_modern: mid-tempo + bright (calm / peaceful)
//   scrapbook:    warm + slow (warm / holiday)
export function deriveFamily(tags) {
  const { mood, energy, bpm } = tags
  if (mood === "upbeat" || mood === "intense") return "bold_promo"
  if (mood === "holiday" || mood === "warm") return "scrapbook"
  if (bpm >= 105 && energy >= 0.5) return "bold_promo"
  if (bpm < 85 && energy < 0.45) return "scrapbook"
  return "clean_modern"
}

// Mood from (bpm, energy, brightness) + filename keyword hints.
//
// Recalibrated 2026-07-22 against 18-track reference pool:
//   - Real music RMS-in-linear-amplitude sits ~0.05..0.30 (not 0..1).
//     0.55 threshold was unreachable → everything landed "peaceful".
//     New threshold: 0.22 for the "energetic" side.
//   - BPM as co-signal: >=115 counts as energetic even at mid energy.
//   - Filename keywords are the STRONGEST signal for genre intent — a track
//     literally called "upbeat corporate" IS upbeat regardless of RMS.
//     Same trick as the "christmas" name-hint for holiday.
export function deriveMood(bpm, energy, brightness, nameHint = "") {
  const name = nameHint.toLowerCase()

  // Filename hints — highest confidence.
  if (/christmas|holiday|xmas|santa/.test(name)) return "holiday"
  if (/upbeat|energetic|promo|gym|workout|action|corporate|inspire|success/.test(name)) {
    return brightness > 0.55 ? "upbeat" : "intense"
  }
  if (/chill|lofi|ambient|bliss/.test(name)) {
    return brightness > 0.55 ? "peaceful" : "calm"
  }

  // Audio-feature fallback — thresholds calibrated for real music RMS scale.
  if ((energy >= 0.25 || bpm >= 115) && brightness > 0.55 && bpm >= 100) return "upbeat"
  if ((energy >= 0.25 || bpm >= 115) && brightness <= 0.55) return "intense"
  if (energy < 0.20 && brightness > 0.55) return "peaceful"
  if (energy < 0.20 && brightness <= 0.55) return "warm"
  if (energy < 0.25) return "calm"
  return "warm"
}

// Deterministic slot slug from the tags. Format: {family}_{descriptor}.
// The descriptor combines mood + a rough BPM band so multiple tracks in
// the same family don't collide (bold_promo_upbeat_fast vs upbeat_mid).
export function deriveSlotSlug(family, tags, existingIdsInFamily) {
  const band = tags.bpm >= 120 ? "fast" : tags.bpm >= 95 ? "mid" : "slow"
  let base = `${family}_${tags.mood}_${band}`
  if (!existingIdsInFamily.includes(base)) return base
  // Collision: append a monotonic suffix.
  for (let n = 2; n <= 99; n++) {
    const candidate = `${base}_${n}`
    if (!existingIdsInFamily.includes(candidate)) return candidate
  }
  throw new Error(`Cannot derive unique slot slug for ${base}`)
}

// ── Essentia backend (optional) ─────────────────────────────────────────────

async function tryEssentia(filePath) {
  const bin = await which("essentia_streaming_extractor_music")
  if (!bin) return null

  const tmp = tmpdir()
  const outputPath = join(tmp, `atve_essentia_${Date.now()}_${Math.random().toString(36).slice(2)}.json`)

  try {
    await new Promise((resolve, reject) => {
      const child = spawn(bin, [filePath, outputPath])
      let stderr = ""
      child.stderr.on("data", (d) => { stderr += d.toString() })
      child.on("close", (code) => {
        if (code === 0) resolve()
        else reject(new Error(`essentia exit ${code}: ${stderr.slice(-500)}`))
      })
      child.on("error", reject)
    })

    const raw = await fs.readFile(outputPath, "utf8")
    const data = JSON.parse(raw)

    const bpm = data.rhythm?.bpm ?? 100
    const energy = clamp01(data.lowlevel?.average_loudness ?? 0.5)
    const brightness = clamp01((data.lowlevel?.spectral_centroid?.mean ?? 2500) / 5000)
    const dynamics = clamp01(data.lowlevel?.dynamic_complexity ?? 0.3)
    const mood = deriveMood(bpm, energy, brightness, filePath)

    return { bpm: Math.round(bpm), energy, brightness, dynamics, mood }
  } finally {
    await fs.unlink(outputPath).catch(() => {})
  }
}

// ── Local heuristics backend (default) ──────────────────────────────────────

async function localTags(filePath) {
  const [bpm, energyStats, brightness] = await Promise.all([
    computeBpmLocal(filePath),
    computeEnergyStats(filePath),
    computeBrightness(filePath),
  ])
  const mood = deriveMood(bpm, energyStats.mean, brightness, filePath)
  return {
    bpm,
    energy: energyStats.mean,
    brightness,
    dynamics: energyStats.stddev,
    mood,
  }
}

// BPM via music-tempo. We decode the audio to raw PCM samples via ffmpeg,
// downsample to mono @ 22050 Hz (music-tempo default), pass to MusicTempo.
//
// Harmonic guard: BPM detectors regularly return double-time (e.g. 150 for
// a 75-BPM ballad because it hears the eighth-note pulse). If the raw value
// is > 160, halve it — most business ad music sits 60-140 BPM, and a "fast"
// track will still be tagged as fast at 80 BPM after halving (band=slow) but
// won't false-positive as extreme.
export function harmonicSafeBpm(raw) {
  if (!Number.isFinite(raw)) return 100
  if (raw > 160) return Math.round(raw / 2)
  return Math.round(raw)
}

async function computeBpmLocal(filePath) {
  const tmp = tmpdir()
  const rawPath = join(tmp, `atve_bpm_${Date.now()}_${Math.random().toString(36).slice(2)}.raw`)
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(FFMPEG, [
        "-y", "-v", "error",
        "-i", filePath,
        "-ac", "1",
        "-ar", "22050",
        "-f", "f32le",
        rawPath,
      ])
      let stderr = ""
      child.stderr.on("data", (d) => { stderr += d.toString() })
      child.on("close", (code) => {
        if (code === 0) resolve()
        else reject(new Error(`ffmpeg pcm decode exit ${code}: ${stderr.slice(-500)}`))
      })
      child.on("error", reject)
    })

    const buf = await fs.readFile(rawPath)
    const samples = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
    const mt = new MusicTempo(Array.from(samples))
    const bpmNum = parseFloat(mt.tempo)
    return Math.max(40, Math.min(200, harmonicSafeBpm(bpmNum)))
  } finally {
    await fs.unlink(rawPath).catch(() => {})
  }
}

// Mean + stddev of per-second RMS in linear amplitude (0..1). Uses ffmpeg
// astats — same source as the curate script's window-picker.
async function computeEnergyStats(filePath) {
  const stderr = await ffmpegStderr([
    "-nostats", "-hide_banner",
    "-i", filePath,
    "-af", "asetnsamples=n=44100,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
    "-f", "null", "-",
  ])
  const rmsSeries = []
  const re = /Overall\.RMS_level=(-?\d+(?:\.\d+)?|-?inf)/g
  let m
  while ((m = re.exec(stderr)) !== null) {
    const db = m[1] === "-inf" ? Number.NEGATIVE_INFINITY : parseFloat(m[1])
    // Convert dB to linear (0..1). -60 dB and below → 0.
    const linear = Number.isFinite(db) ? Math.pow(10, db / 20) : 0
    rmsSeries.push(linear)
  }
  if (rmsSeries.length === 0) return { mean: 0.3, stddev: 0.1 }
  const mean = rmsSeries.reduce((a, b) => a + b, 0) / rmsSeries.length
  const variance = rmsSeries.reduce((a, b) => a + (b - mean) ** 2, 0) / rmsSeries.length
  return { mean: clamp01(mean), stddev: clamp01(Math.sqrt(variance)) }
}

// Brightness proxy: ratio of HF-band (>2kHz) to full-band RMS. Imperfect —
// the ratio saturates at 1.0 for a lot of chill music because the high-pass
// changes the amplitude envelope, and ZCR turned out to be too flat across
// this music pool to discriminate. Kept as-is knowing that:
//   1. It DOES separate some tracks (Feel-Good scored 0.31, most others 0.75+)
//   2. Real spectral centroid needs FFT or Essentia — deferred
//   3. Family assignment relies on multiple signals (energy + BPM + mood)
async function computeBrightness(filePath) {
  const [fullStd, hfStd] = await Promise.all([
    ffmpegStderr([
      "-nostats", "-hide_banner",
      "-i", filePath,
      "-af", "astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
      "-f", "null", "-",
    ]),
    ffmpegStderr([
      "-nostats", "-hide_banner",
      "-i", filePath,
      "-af", "highpass=f=2000,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
      "-f", "null", "-",
    ]),
  ])
  const fullDb = extractFirstNumber(fullStd, /Overall\.RMS_level=(-?\d+(?:\.\d+)?|-?inf)/)
  const hfDb = extractFirstNumber(hfStd, /Overall\.RMS_level=(-?\d+(?:\.\d+)?|-?inf)/)
  if (fullDb === null || hfDb === null) return 0.5
  const fullLin = Math.pow(10, fullDb / 20)
  const hfLin = Math.pow(10, hfDb / 20)
  return fullLin === 0 ? 0.5 : clamp01(hfLin / fullLin)
}

// ── Utilities ───────────────────────────────────────────────────────────────

function ffmpegStderr(args) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error("ffmpeg binary not available"))
    const child = spawn(FFMPEG, args)
    let stderr = ""
    child.stderr.on("data", (d) => { stderr += d.toString() })
    child.on("close", () => resolve(stderr))
    child.on("error", reject)
  })
}

function extractFirstNumber(text, regex) {
  const m = regex.exec(text)
  if (!m) return null
  return m[1] === "-inf" ? -80 : parseFloat(m[1])
}

function clamp01(v) {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

async function which(cmd) {
  return new Promise((resolve) => {
    const child = spawn("which", [cmd])
    let stdout = ""
    child.stdout.on("data", (d) => { stdout += d.toString() })
    child.on("close", (code) => {
      resolve(code === 0 && stdout.trim() ? stdout.trim() : null)
    })
    child.on("error", () => resolve(null))
  })
}
