import ffmpeg from "fluent-ffmpeg"
import ffmpegStatic from "ffmpeg-static"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"
import { ffprobeBinary } from "@/lib/paths"

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

// ffprobe-static uses __dirname to locate its binary, but Turbopack rewrites
// __dirname to /ROOT in the standalone bundle. Resolved via lib/paths.ts
// (import.meta.url based) so Turbopack traces the exact path, not the whole
// working directory.
ffmpeg.setFfprobePath(ffprobeBinary())

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download (${res.status}): ${url}`)
  await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()))
}

function probeDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, meta) => {
      if (err) return reject(err)
      resolve(meta.format.duration ?? 0)
    })
  })
}

// Writes a silent PCM WAV file — avoids needing lavfi/anullsrc in ffmpeg.
async function createSilentWav(durationSec: number, outputPath: string): Promise<void> {
  const sampleRate = 44100
  const channels = 2
  const numSamples = Math.ceil(sampleRate * durationSec) * channels
  const dataSize = numSamples * 2 // 16-bit samples
  const buf = Buffer.alloc(44 + dataSize)
  buf.write("RIFF", 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write("WAVE", 8)
  buf.write("fmt ", 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)          // PCM
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * channels * 2, 28)
  buf.writeUInt16LE(channels * 2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write("data", 36)
  buf.writeUInt32LE(dataSize, 40)
  // remaining bytes are already zero (silence)
  await fs.writeFile(outputPath, buf)
}

// Returns an ffmpeg audio filter that trims audio to videoDur with a short fade-out.
// Speeding audio up via atempo degrades clarity significantly at >1.5x; trimming
// is always preferred because the narration was recorded at natural pace.
function audioTrimFilter(videoDur: number): string {
  const fadeDur = Math.min(1.5, videoDur * 0.25)
  const fadeStart = Math.max(0, videoDur - fadeDur)
  return `atrim=0:${videoDur.toFixed(3)},afade=type=out:start_time=${fadeStart.toFixed(3)}:duration=${fadeDur.toFixed(3)}`
}

async function mergeVideoAudio(
  videoPath: string,
  audioPath: string | null,
  outputPath: string
): Promise<void> {
  let silencePath: string | null = null
  const videoDur = await probeDuration(videoPath)

  let resolvedAudio: string
  if (audioPath) {
    resolvedAudio = audioPath
  } else {
    silencePath = outputPath + ".silence.wav"
    await createSilentWav(videoDur + 0.5, silencePath)
    resolvedAudio = silencePath
  }

  // Output duration policy: always play the FULL video. Two cases:
  //   - Audio shorter than video → pad audio with trailing silence via apad,
  //     so the character stays on-screen and animated for the full clip.
  //     (Previously we trimmed video to audio length. That caused short lines
  //     like "Yes!" to chop a 6s WAN clip down to 2s, and the first 2s of a
  //     slow-motion clip looks like a still frame — users read it as "just an
  //     image". Padding audio keeps the motion visible.)
  //   - Audio longer than video → trim audio to video length with a fade-out.
  //     Rare after Haiku word budget + Kokoro speed control — this is backstop.
  let audioFilterStr: string | null = null
  if (audioPath) {
    const audioDur = await probeDuration(resolvedAudio)
    if (videoDur > 0 && audioDur > videoDur * 1.05) {
      audioFilterStr = audioTrimFilter(videoDur)
    } else if (audioDur > 0 && audioDur < videoDur) {
      // apad extends audio with silence to any target length; combined with
      // -t at the end this fills exactly to videoDur.
      audioFilterStr = "apad"
    }
  }
  const outputDur = videoDur

  try {
    await new Promise<void>((resolve, reject) => {
      const opts = [
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-t", outputDur.toFixed(3),
        "-movflags", "+faststart",
      ]
      if (audioFilterStr) opts.push("-af", audioFilterStr)
      ffmpeg()
        .input(videoPath)
        .input(resolvedAudio)
        .outputOptions(opts)
        .output(outputPath)
        .on("error", reject)
        .on("end", () => resolve())
        .run()
    })
  } finally {
    if (silencePath) await fs.unlink(silencePath).catch(() => {})
  }
}

function buildConcatList(localPaths: string[]): string {
  return localPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n")
}

// Concatenates N video-only chunks (WAN i2v output) into one MP4 clipped to
// `targetSeconds`. Used to stitch chained WAN clips within a single scene
// BEFORE audio is merged. Stream-copy is used when chunks share the same
// codec profile (WAN output is stable), so this is fast.
export async function concatVideoChunks(
  videoUrls: string[],
  targetSeconds: number,
  outputPath: string,
): Promise<void> {
  if (videoUrls.length === 0) throw new Error("No video chunks to concatenate")
  if (videoUrls.length === 1) {
    // Single chunk: just download and trim to target.
    const tmp = tmpdir()
    const sessionId = `atve_chunk1_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const localPath = join(tmp, `${sessionId}.mp4`)
    try {
      await downloadFile(videoUrls[0], localPath)
      const dur = await probeDuration(localPath)
      if (dur <= targetSeconds + 0.05) {
        await fs.copyFile(localPath, outputPath)
        return
      }
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(localPath)
          .outputOptions([
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-t", targetSeconds.toFixed(3),
            "-movflags", "+faststart",
          ])
          .output(outputPath)
          .on("error", reject)
          .on("end", () => resolve())
          .run()
      })
    } finally {
      await fs.unlink(localPath).catch(() => {})
    }
    return
  }

  const tmp = tmpdir()
  const sessionId = `atve_chunks_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const localPaths: string[] = []
  const concatListPath = join(tmp, `${sessionId}_list.txt`)
  const rawConcatPath = join(tmp, `${sessionId}_raw.mp4`)

  try {
    await Promise.all(
      videoUrls.map(async (url, i) => {
        const p = join(tmp, `${sessionId}_c${i}.mp4`)
        await downloadFile(url, p)
        localPaths[i] = p
      }),
    )

    await fs.writeFile(concatListPath, buildConcatList(localPaths))

    // Step 1: concat all chunks stream-copied (WAN output is homogeneous).
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy", "-movflags", "+faststart"])
        .output(rawConcatPath)
        .on("error", reject)
        .on("end", () => resolve())
        .run()
    })

    // Step 2: trim to target duration (re-encode; stream-copy can't cut mid-frame).
    const combinedDur = await probeDuration(rawConcatPath)
    if (combinedDur <= targetSeconds + 0.05) {
      await fs.copyFile(rawConcatPath, outputPath)
    } else {
      await new Promise<void>((resolve, reject) => {
        ffmpeg()
          .input(rawConcatPath)
          .outputOptions([
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
            "-t", targetSeconds.toFixed(3),
            "-movflags", "+faststart",
          ])
          .output(outputPath)
          .on("error", reject)
          .on("end", () => resolve())
          .run()
      })
    }
  } finally {
    await Promise.all([
      ...localPaths.map((p) => fs.unlink(p).catch(() => {})),
      fs.unlink(concatListPath).catch(() => {}),
      fs.unlink(rawConcatPath).catch(() => {}),
    ])
  }
}

export type Clip = { videoUrl: string; audioUrl: string | null }

export async function concatenateClips(clips: Clip[], outputPath: string): Promise<void> {
  if (clips.length === 0) throw new Error("No clips to concatenate")

  const sessionId = `atve_${Date.now()}_${Math.random().toString(36).slice(2)}`
  const tmp = tmpdir()
  const rawVideoPaths: string[] = []
  const rawAudioPaths: (string | null)[] = []
  const mergedPaths: string[] = []
  const concatListPath = join(tmp, `${sessionId}_concat.txt`)

  try {
    // 1. Download all video and audio files in parallel
    await Promise.all(
      clips.map(async (clip, i) => {
        const videoPath = join(tmp, `${sessionId}_v${i}.mp4`)
        await downloadFile(clip.videoUrl, videoPath)
        rawVideoPaths[i] = videoPath

        if (clip.audioUrl) {
          const audioPath = join(tmp, `${sessionId}_a${i}.wav`)
          await downloadFile(clip.audioUrl, audioPath)
          rawAudioPaths[i] = audioPath
        } else {
          rawAudioPaths[i] = null
        }
      })
    )

    // 2. Merge each clip with its audio (or silence) sequentially to avoid FFmpeg conflicts
    for (let i = 0; i < clips.length; i++) {
      const mergedPath = join(tmp, `${sessionId}_m${i}.mp4`)
      await mergeVideoAudio(rawVideoPaths[i], rawAudioPaths[i], mergedPath)
      mergedPaths[i] = mergedPath
    }

    // 3. Concat all merged clips
    if (mergedPaths.length === 1) {
      await fs.copyFile(mergedPaths[0], outputPath)
      return
    }

    await fs.writeFile(concatListPath, buildConcatList(mergedPaths))

    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .input(concatListPath)
        .inputOptions(["-f", "concat", "-safe", "0"])
        .outputOptions(["-c", "copy", "-movflags", "+faststart"])
        .output(outputPath)
        .on("error", reject)
        .on("end", () => resolve())
        .run()
    })
  } finally {
    const toClean = [
      ...rawVideoPaths,
      ...rawAudioPaths.filter(Boolean) as string[],
      ...mergedPaths,
      concatListPath,
    ]
    await Promise.all(toClean.map((p) => fs.unlink(p).catch(() => {})))
  }
}
