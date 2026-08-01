import { spawn } from "child_process"
import ffmpegStatic from "ffmpeg-static"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// Given a local audio file, find the highest-energy `windowSec` region using
// per-second RMS. The window's start time (0-indexed seconds) is returned so
// the caller can trim to it.
//
// Algorithm:
//   1. Ask ffmpeg to print per-second RMS via `astats` + `ametadata=print`.
//   2. Parse the "Overall.RMS_level" values from stderr — one number per sec.
//   3. Slide a `windowSec`-wide window across the series; return the start
//      whose window sum is maximum. If the source is shorter than the window,
//      return 0.

const FFMPEG = ffmpegStatic as string | null

export type EnergyWindow = {
  startSec: number
  sourceDurationSec: number
  perSecondRms: number[]      // dB, or -Infinity for silence
}

function runFfmpegCollectStderr(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error("ffmpeg binary not available"))
    const child = spawn(FFMPEG, args)
    let stderr = ""
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    child.on("close", (code: number) => {
      // ffmpeg exits 0 or non-zero depending on -f null pipe; treat both as
      // success and parse whatever it wrote.
      resolve(stderr)
      void code
    })
    child.on("error", reject)
  })
}

// Parse ffmpeg's ametadata output for RMS-per-second values. The format is:
//   [Parsed_ametadata_2 @ 0x...] lavfi.astats.Overall.RMS_level=-XX.XXXXXX
function parseRmsSeries(stderr: string): number[] {
  const out: number[] = []
  const re = /Overall\.RMS_level=(-?\d+(?:\.\d+)?|-?inf)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(stderr)) !== null) {
    const v = m[1] === "-inf" ? Number.NEGATIVE_INFINITY : parseFloat(m[1])
    out.push(v)
  }
  return out
}

// Convert an RMS-in-dB series into a linear-energy series so window sums are
// meaningful (dB is logarithmic; summing dB is meaningless).
export function dbSeriesToLinearEnergy(dbs: number[]): number[] {
  return dbs.map((db) => (Number.isFinite(db) ? Math.pow(10, db / 20) : 0))
}

// Given a linear-energy series, find the start index whose `windowSize`-wide
// window has the largest sum. Ties resolve to the earliest start.
export function findLoudestWindowStart(linearEnergy: number[], windowSize: number): number {
  if (linearEnergy.length === 0 || windowSize <= 0) return 0
  if (linearEnergy.length <= windowSize) return 0
  let sum = 0
  for (let i = 0; i < windowSize; i++) sum += linearEnergy[i]
  let bestSum = sum
  let bestStart = 0
  for (let i = windowSize; i < linearEnergy.length; i++) {
    sum += linearEnergy[i] - linearEnergy[i - windowSize]
    if (sum > bestSum) {
      bestSum = sum
      bestStart = i - windowSize + 1
    }
  }
  return bestStart
}

// Public entry point. Reads the file's duration + per-second RMS, computes
// the loudest windowSec-wide region.
export async function findLoudestWindow(inputPath: string, windowSec: number): Promise<EnergyWindow> {
  // astats over 1-second chunks (asetnsamples=n=44100 at 44.1kHz = 1s frames).
  // ametadata=print emits one line per frame. -f null suppresses output.
  const stderr = await runFfmpegCollectStderr([
    "-nostats", "-hide_banner",
    "-i", inputPath,
    "-af", "asetnsamples=n=44100,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
    "-f", "null", "-",
  ])
  const rms = parseRmsSeries(stderr)
  const energy = dbSeriesToLinearEnergy(rms)
  const start = findLoudestWindowStart(energy, windowSec)
  return {
    startSec: start,
    sourceDurationSec: rms.length,   // 1s frames
    perSecondRms: rms,
  }
}

// Trim + fade + loudnorm to −18 LUFS. Output is a self-contained MP3 that the
// runtime renderer can play from 0:00 through the ad's total duration
// (max 36.5s — leaves ~8s of buffer at 45s trim target).
export async function trimAndNormalize(
  inputPath: string,
  outputPath: string,
  startSec: number,
  durationSec: number,
): Promise<void> {
  if (!FFMPEG) throw new Error("ffmpeg binary not available")
  const fadeIn = 0.3
  const fadeOut = 0.6
  const fadeOutStart = Math.max(0, durationSec - fadeOut)

  const args = [
    "-y", "-v", "error",
    "-ss", startSec.toFixed(3),
    "-i", inputPath,
    "-t", durationSec.toFixed(3),
    "-af", [
      `afade=type=in:st=0:d=${fadeIn.toFixed(2)}`,
      `afade=type=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOut.toFixed(2)}`,
      // -18 LUFS keeps headroom for VO ducking + final -14 LUFS mix.
      "loudnorm=I=-18:LRA=7:TP=-1.5",
    ].join(","),
    "-c:a", "libmp3lame", "-b:a", "192k",
    outputPath,
  ]

  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG, args)
    let stderr = ""
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    child.on("close", (code: number) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg trim exit ${code}: ${stderr.slice(-2000)}`))
    })
    child.on("error", reject)
  })
}

// One-shot: download a URL to tmp, find loudest window, trim + normalize to
// the destination path. Idempotent per destination.
export async function curateFromUrl(
  sourceUrl: string,
  destinationAbsolutePath: string,
  windowSec: number = 45,
): Promise<{ startSec: number; sourceDurationSec: number }> {
  const tmp = tmpdir()
  const tmpInput = join(tmp, `atve_curate_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`)

  try {
    // Download.
    const res = await fetch(sourceUrl)
    if (!res.ok) throw new Error(`download failed (${res.status}): ${sourceUrl}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(tmpInput, buf)

    // Analyze.
    const window = await findLoudestWindow(tmpInput, windowSec)
    // Guard against a source shorter than the window — trim what's there.
    const actualDuration = Math.min(windowSec, window.sourceDurationSec)

    // Ensure destination dir exists.
    await fs.mkdir(join(destinationAbsolutePath, ".."), { recursive: true })

    // Trim + normalize.
    await trimAndNormalize(tmpInput, destinationAbsolutePath, window.startSec, actualDuration)

    return { startSec: window.startSec, sourceDurationSec: window.sourceDurationSec }
  } finally {
    await fs.unlink(tmpInput).catch(() => {})
  }
}
