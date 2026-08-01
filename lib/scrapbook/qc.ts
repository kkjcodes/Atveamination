import ffmpeg from "fluent-ffmpeg"
import ffmpegStatic from "ffmpeg-static"
import sharp from "sharp"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import {
  QC_MIN_DURATION,
  QC_MAX_DURATION,
  QC_FROZEN_DIFF_THRESHOLD,
  QC_GLITCH_DIFF_THRESHOLD,
  QC_FIRSTFRAME_MSE_MAX,
} from "@/lib/scrapbook/config"
import type { QCResult } from "@/lib/scrapbook/models"
import { ffprobeBinary } from "@/lib/paths"

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}
ffmpeg.setFfprobePath(ffprobeBinary())

// Stage 4: cheap clip QC. No API calls — fully offline.
// Checks:
//   1. Decodes; duration within bounds.
//   2. Frame-diff profile: frozen video (all diffs ~0) or glitch spikes.
//   3. First frame roughly matches the before-keyframe (model honored input).
// Any failure → QCResult(passed=false, reason=...), caller degrades to
// Ken Burns fallback. Never crash the job because a page failed QC.

function probe(filePath: string): Promise<{ duration: number; hasVideo: boolean }> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return reject(err)
      const hasVideo = (meta.streams ?? []).some((s) => s.codec_type === "video")
      resolve({ duration: meta.format.duration ?? 0, hasVideo })
    })
  })
}

async function sampleFramesToDisk(videoPath: string, sessionDir: string, count: number): Promise<string[]> {
  await fs.mkdir(sessionDir, { recursive: true })
  const pattern = join(sessionDir, "f%03d.png")
  await new Promise<void>((resolve, reject) => {
    ffmpeg()
      .input(videoPath)
      .videoFilters([`fps=2`, `scale=64:64`, `format=gray`])
      .outputOptions(["-frames:v", String(count)])
      .output(pattern)
      .on("error", reject)
      .on("end", () => resolve())
      .run()
  })
  const files: string[] = []
  for (let i = 1; i <= count; i++) {
    const p = join(sessionDir, `f${String(i).padStart(3, "0")}.png`)
    try {
      await fs.access(p)
      files.push(p)
    } catch {
      break
    }
  }
  return files
}

async function loadGray64(path: string): Promise<Buffer> {
  return await sharp(path).resize(64, 64, { fit: "fill" }).grayscale().raw().toBuffer()
}

function meanAbsDiff(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let sum = 0
  for (let i = 0; i < n; i++) sum += Math.abs(a[i] - b[i])
  return sum / n
}

function mse(a: Buffer, b: Buffer): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let sum = 0
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return sum / n
}

// Given a rendered clip and (optionally) the before-keyframe it was
// conditioned on, run the QC heuristics. Metrics are recorded regardless of
// pass/fail so we can tune thresholds from real runs.
export async function checkClip(
  clipPath: string,
  beforeKeyframePath: string | null,
): Promise<QCResult> {
  const metrics: QCResult["metrics"] = {}
  const sessionDir = join(tmpdir(), `atve_qc_${Date.now()}_${Math.random().toString(36).slice(2)}`)

  try {
    // 1. Decode + duration
    let info: { duration: number; hasVideo: boolean }
    try {
      info = await probe(clipPath)
    } catch (e) {
      return { passed: false, reason: `clip does not decode: ${(e as Error)?.message}`, metrics }
    }
    if (!info.hasVideo) return { passed: false, reason: "no video stream", metrics }
    metrics.duration = info.duration
    if (info.duration < QC_MIN_DURATION || info.duration > QC_MAX_DURATION) {
      return { passed: false, reason: `duration ${info.duration.toFixed(2)}s out of bounds`, metrics }
    }

    // 2. Frame-diff profile
    const frames = await sampleFramesToDisk(clipPath, sessionDir, 8)
    if (frames.length < 3) {
      return { passed: false, reason: "could not sample frames", metrics }
    }
    const grays = await Promise.all(frames.map(loadGray64))
    const diffs = grays.slice(1).map((g, i) => meanAbsDiff(grays[i], g))
    metrics.mean_diff = diffs.reduce((a, b) => a + b, 0) / diffs.length
    metrics.max_diff = Math.max(...diffs)
    if (metrics.mean_diff < QC_FROZEN_DIFF_THRESHOLD) {
      return { passed: false, reason: "video appears frozen (no motion)", metrics }
    }
    if (metrics.max_diff > QC_GLITCH_DIFF_THRESHOLD) {
      return { passed: false, reason: "glitch frame detected (diff spike)", metrics }
    }

    // 3. Conditioning check: first frame vs before-keyframe
    if (beforeKeyframePath) {
      const ref = await loadGray64(beforeKeyframePath)
      metrics.firstframe_mse = mse(ref, grays[0])
      if (metrics.firstframe_mse > QC_FIRSTFRAME_MSE_MAX) {
        return {
          passed: false,
          reason: "first frame diverges from before-keyframe",
          metrics,
        }
      }
    }

    return { passed: true, reason: "ok", metrics }
  } finally {
    await fs.rm(sessionDir, { recursive: true, force: true }).catch(() => {})
  }
}
