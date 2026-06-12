import ffmpeg from "fluent-ffmpeg"
import ffmpegStatic from "ffmpeg-static"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"

if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic)
}

// ffprobe-static uses __dirname to locate its binary, but Turbopack rewrites
// __dirname to /ROOT in the standalone bundle. Use process.cwd() instead,
// which resolves to /app at runtime in the container.
ffmpeg.setFfprobePath(
  join(process.cwd(), "node_modules", "ffprobe-static", "bin", process.platform, process.arch, "ffprobe")
)

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

// Returns atempo filter chain to hit target speed.
// atempo is clamped to [0.5, 2.0] per pass, so speeds > 2x require chaining.
function atempoFilters(speed: number): string[] {
  const filters: string[] = []
  let remaining = speed
  while (remaining > 2.0) {
    filters.push("atempo=2.0")
    remaining /= 2.0
  }
  filters.push(`atempo=${remaining.toFixed(4)}`)
  return filters
}

async function mergeVideoAudio(
  videoPath: string,
  audioPath: string | null,
  outputPath: string
): Promise<void> {
  let silencePath: string | null = null
  let resolvedAudio: string

  if (audioPath) {
    resolvedAudio = audioPath
  } else {
    // lavfi/anullsrc is not available in the static ffmpeg build; generate silence in Node instead.
    silencePath = outputPath + ".silence.wav"
    const dur = await probeDuration(videoPath)
    await createSilentWav(dur + 0.5, silencePath)
    resolvedAudio = silencePath
  }

  let audioFilterStr: string | null = null
  if (audioPath) {
    const [videoDur, audioDur] = await Promise.all([
      probeDuration(videoPath),
      probeDuration(resolvedAudio),
    ])
    if (videoDur > 0 && audioDur > videoDur * 1.05) {
      const speed = Math.min(audioDur / videoDur, 4.0)
      audioFilterStr = atempoFilters(speed).join(",")
    }
  }

  try {
    await new Promise<void>((resolve, reject) => {
      const opts = [
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-ac", "2",
        "-shortest",
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
