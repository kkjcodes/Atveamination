import { runFfmpeg } from "@/lib/business/render/scene"
import type { MusicLevel } from "@/lib/business/adscript-schema"

// Given per-scene VO clips + per-scene durations + a music track path,
// produce a single mixed audio file matching the total video duration.
//
// Mix contract (BUSINESS-FORK-HANDOFF.md §3.5):
//   - VO placed at scene offsets (first VO at 0.0s after scene 0's silent
//     lead-in of 0.2s to match the scene visuals landing).
//   - Music bed under everything, looped/trimmed to total duration.
//   - Music ducked under VO via sidechaincompress.
//   - Music fades out over last 1.5s.
//   - Whole mix loudnorm to -14 LUFS (single-pass — fast enough, close enough).
//
// music_level scales the pre-mix music gain BEFORE ducking:
//   normal → 0 dB     (default; ducks to ~-18 dB under VO)
//   quiet  → -6 dB    (ducks to ~-24 dB under VO)
//   off    → -100 dB  (effectively silent — VO carries alone)

export type SceneAudioClip = {
  audioPath: string       // local path to VO wav; null → scene is silent (end_card sometimes)
  startOffsetSec: number  // when to place this VO on the timeline
}

const LEAD_IN_SEC = 0.2

export function sceneOffsets(sceneDurations: number[]): number[] {
  const offsets: number[] = []
  let acc = LEAD_IN_SEC
  for (const d of sceneDurations) {
    offsets.push(acc)
    acc += d
  }
  return offsets
}

function musicGain(level: MusicLevel): number {
  switch (level) {
    case "off":    return -100
    case "quiet":  return -6
    case "normal": return 0
  }
}

// Build the full mixed audio track. Inputs: scene VO clips + music path +
// total duration. Output: one WAV/AAC on disk.
export async function mixAudio(
  voClips: Array<SceneAudioClip | null>,
  musicPath: string | null,
  musicLevel: MusicLevel,
  totalDurationSec: number,
  outputPath: string,
): Promise<void> {
  const filledClips = voClips.filter((c): c is SceneAudioClip => c !== null)

  // ── Case A: no VO, no music → silent stereo track ────────────────────────
  if (filledClips.length === 0 && !musicPath) {
    await runFfmpeg([
      "-y", "-v", "error",
      "-f", "lavfi",
      "-i", `anullsrc=r=44100:cl=stereo:d=${totalDurationSec.toFixed(3)}`,
      "-c:a", "aac", "-b:a", "128k",
      outputPath,
    ])
    return
  }

  const args: string[] = ["-y", "-v", "error"]
  const filterParts: string[] = []
  const inputStreams: string[] = []
  let inputIdx = 0

  // Silent base track — everything overlays onto this. Guarantees the
  // final track is exactly totalDurationSec even if VO ends early.
  args.push("-f", "lavfi", "-i", `anullsrc=r=44100:cl=stereo:d=${totalDurationSec.toFixed(3)}`)
  const baseIdx = inputIdx++
  inputStreams.push(`[${baseIdx}:a]`)

  // ── VO clips ─────────────────────────────────────────────────────────────
  const voLabels: string[] = []
  for (const clip of filledClips) {
    args.push("-i", clip.audioPath)
    const idx = inputIdx++
    const delayMs = Math.round(clip.startOffsetSec * 1000)
    filterParts.push(`[${idx}:a]adelay=${delayMs}|${delayMs},apad=whole_dur=${totalDurationSec.toFixed(3)}[vo${idx}]`)
    voLabels.push(`[vo${idx}]`)
  }

  // Concat all VO labels into one bus for ducking sidechain.
  let voBus: string | null = null
  if (voLabels.length > 0) {
    filterParts.push(`${voLabels.join("")}amix=inputs=${voLabels.length}:duration=first:normalize=0[vobus]`)
    voBus = "[vobus]"
  }

  // ── Music ────────────────────────────────────────────────────────────────
  // Pre-curated tracks are trimmed to 45s (see scripts/curate-music.ts) which
  // covers doc §3 max ad duration (35s scenes + 1.5s outro = 36.5s). We use
  // `-stream_loop -1` as a safety net: if a track shipped without curation
  // is shorter than the ad, ffmpeg loops back to 0. That creates a seam —
  // fine for a fallback but a lint would fire if it happens in production.
  let musicOut: string | null = null
  if (musicPath) {
    args.push("-stream_loop", "-1", "-i", musicPath)
    const mIdx = inputIdx++
    const gain = musicGain(musicLevel)
    const fadeStart = Math.max(0, totalDurationSec - 1.5).toFixed(3)
    filterParts.push(
      `[${mIdx}:a]volume=${gain}dB,atrim=0:${totalDurationSec.toFixed(3)},afade=type=out:start_time=${fadeStart}:duration=1.5[musictrim]`,
    )
    if (voBus && gain > -50) {
      // Duck music under VO.
      filterParts.push(
        `[musictrim]${voBus}sidechaincompress=threshold=0.05:ratio=8:attack=5:release=250[mducked]`,
      )
      musicOut = "[mducked]"
    } else {
      musicOut = "[musictrim]"
    }
  }

  // ── Final mix ────────────────────────────────────────────────────────────
  const mixInputs: string[] = []
  if (voBus) mixInputs.push(voBus)
  if (musicOut) mixInputs.push(musicOut)
  if (mixInputs.length === 0) {
    // Just the silent base.
    filterParts.push(`${inputStreams[0]}anull[mixout]`)
  } else {
    filterParts.push(`${mixInputs.join("")}amix=inputs=${mixInputs.length}:duration=first:normalize=0[premix]`)
    // Loudness normalize to -14 LUFS. Single-pass (I=integrated target).
    filterParts.push(`[premix]loudnorm=I=-14:TP=-1.5:LRA=11[mixout]`)
  }

  args.push(
    "-filter_complex", filterParts.join(";"),
    "-map", "[mixout]",
    "-c:a", "aac", "-b:a", "192k",
    "-ar", "44100",
    "-ac", "2",
    outputPath,
  )

  await runFfmpeg(args)
}
