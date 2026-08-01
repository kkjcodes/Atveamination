import ffmpegStatic from "ffmpeg-static"
import { spawn } from "child_process"
import { join } from "path"
import { promises as fs } from "fs"
import type { AdScript, TemplateFamily } from "@/lib/business/adscript-schema"
import { OUTPUT_FPS } from "@/lib/business/render/dimensions"
import { buildMotionFilter } from "@/lib/business/render/motion"
import {
  drawtextFragment,
  endCardStack,
  overlayTextForScene,
  escapeDrawtext,
  fitFontSize,
} from "@/lib/business/render/text-overlay"

// Per-scene renderer. Given a scene, its source image (or logo), the target
// aspect, and the derived duration, produce a silent MP4 clip that becomes
// one segment of the final video.
//
// Template family colors the composition:
//   - clean_modern: full-bleed photo + lower-third overlay
//   - bold_promo:   photo with saturated color-block band behind the text
//   - scrapbook:    photo as taped print on parchment page (ported from scrapbook)

export type SceneRenderInput = {
  scene: AdScript["scenes"][number]
  sourceImagePath: string    // local disk path (downloaded from Asset URL)
  logoImagePath?: string     // for end_card
  durationSec: number        // derived: max(min_seconds, vo_dur + 0.5)
  outputPath: string
  width: number
  height: number
  templateFamily: TemplateFamily
  captionFontPath: string | null   // handwriting for scrapbook, sans elsewhere
  paletteBgHex: string       // for bold_promo band
  textPosition: "upper_third" | "center" | "lower_third"
}

// clean_modern: full-bleed photo with motion + lower-third caption.
async function renderCleanModern(input: SceneRenderInput): Promise<void> {
  const { scene, sourceImagePath, durationSec, outputPath, width, height, captionFontPath, textPosition } = input
  const motion = scene.type === "end_card" ? "hold" : scene.motion
  const motionFilter = buildMotionFilter(motion, durationSec, width, height)

  let filter: string
  if (scene.type === "end_card") {
    const stack = endCardStack(scene.lines, width, height, captionFontPath)
    filter = `${motionFilter},${stack},format=yuv420p`
  } else {
    const text = overlayTextForScene(scene)
    const overlay = text
      ? "," + drawtextFragment(text, textPosition, width, height, captionFontPath)
      : ""
    filter = `${motionFilter}${overlay},format=yuv420p`
  }

  await runFfmpeg([
    "-y", "-v", "error",
    "-loop", "1", "-i", sourceImagePath,
    "-vf", filter,
    "-t", durationSec.toFixed(3),
    "-r", String(OUTPUT_FPS),
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    outputPath,
  ])
}

// bold_promo: same photo motion but a saturated color band behind the text
// for high-contrast overlay. The band spans the width, ~1/3 of frame height.
async function renderBoldPromo(input: SceneRenderInput): Promise<void> {
  const { scene, sourceImagePath, durationSec, outputPath, width, height, captionFontPath, paletteBgHex } = input
  const motion = scene.type === "end_card" ? "hold" : scene.motion
  const motionFilter = buildMotionFilter(motion, durationSec, width, height)

  // Band Y and height depend on textPosition; for bold_promo we always
  // place it in the lower-third for punch.
  const bandH = Math.round(height * 0.28)
  const bandY = height - bandH - Math.round(height * 0.05)

  let filter: string
  if (scene.type === "end_card") {
    const stack = endCardStack(scene.lines, width, height, captionFontPath)
    filter = `${motionFilter},${stack},format=yuv420p`
  } else {
    const text = overlayTextForScene(scene) ?? ""
    // Drawbox behind the text.
    const band = `drawbox=x=0:y=${bandY}:w=${width}:h=${bandH}:color=${paletteBgHex}@0.85:t=fill`
    const font = captionFontPath ? `fontfile='${captionFontPath}'` : `font='sans'`
    // fitFontSize prevents long benefit lines (up to 12 words) from clipping
    // off the frame edges — the naive height * 0.08 was ~154px on 9:16, wider
    // than the 1080 frame for anything past ~14 chars.
    const fontSize = fitFontSize(text, width, Math.round(height * 0.08))
    const textY = bandY + Math.round(bandH / 2 - fontSize / 2)
    const drawtext = `drawtext=text='${escapeDrawtext(text)}':${font}:fontsize=${fontSize}:fontcolor=0xF5F5F0:x=(w-text_w)/2:y=${textY}:borderw=3:bordercolor=0x00000080`
    filter = `${motionFilter},${band},${drawtext},format=yuv420p`
  }

  await runFfmpeg([
    "-y", "-v", "error",
    "-loop", "1", "-i", sourceImagePath,
    "-vf", filter,
    "-t", durationSec.toFixed(3),
    "-r", String(OUTPUT_FPS),
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    outputPath,
  ])
}

// scrapbook: photo composited as a rotated print on a parchment page,
// handwritten-style caption. Reuses the visual signature from the family
// scrapbook feature so users see brand continuity.
async function renderScrapbook(input: SceneRenderInput): Promise<void> {
  const { scene, sourceImagePath, durationSec, outputPath, width, height, captionFontPath } = input
  // For scrapbook we skip zoompan and use a static composite (page-turn
  // xfade handles the motion between scenes at concat time).
  if (scene.type === "end_card") {
    const stack = endCardStack(scene.lines, width, height, captionFontPath)
    // Special case: end_card in scrapbook uses a solid parchment (no photo).
    await runFfmpeg([
      "-y", "-v", "error",
      "-f", "lavfi",
      "-i", `color=c=0xF5EBDC:s=${width}x${height}:r=${OUTPUT_FPS}:d=${durationSec.toFixed(3)}`,
      "-vf", `${stack},format=yuv420p`,
      "-t", durationSec.toFixed(3),
      "-r", String(OUTPUT_FPS),
      "-pix_fmt", "yuv420p",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      outputPath,
    ])
    return
  }

  // Non-end-card: photo scaled to ~70% width, white border, slight rotation.
  const photoTargetW = Math.round(width * 0.7)
  const text = overlayTextForScene(scene) ?? ""
  const font = captionFontPath ? `fontfile='${captionFontPath}'` : `font='sans'`
  const fontSize = Math.round(height * 0.05)
  const captionY = Math.round(height * 0.86)
  const captionFilter = text
    ? `,drawtext=text='${escapeDrawtext(text)}':${font}:fontsize=${fontSize}:fontcolor=0x4a3b2a:x=(w-text_w)/2:y=${captionY}:borderw=0`
    : ""
  const complex = [
    `[1:v]scale=${photoTargetW}:-2,setsar=1,pad=iw+40:ih+40:20:20:white,rotate=0.026:c=none:ow=rotw(0.026):oh=roth(0.026)[photo]`,
    `[0:v]scale=${width}:${height},setsar=1[bg]`,
    `[bg][photo]overlay=(W-w)/2:(H-h)/2${captionFilter},format=yuv420p[v]`,
  ].join(";")

  await runFfmpeg([
    "-y", "-v", "error",
    "-f", "lavfi",
    "-i", `color=c=0xF5EBDC:s=${width}x${height}:r=${OUTPUT_FPS}:d=${durationSec.toFixed(3)}`,
    "-loop", "1", "-i", sourceImagePath,
    "-filter_complex", complex,
    "-map", "[v]",
    "-t", durationSec.toFixed(3),
    "-r", String(OUTPUT_FPS),
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    outputPath,
  ])
}

export async function renderScene(input: SceneRenderInput): Promise<void> {
  await fs.mkdir(join(input.outputPath, ".."), { recursive: true }).catch(() => {})
  switch (input.templateFamily) {
    case "clean_modern": return renderCleanModern(input)
    case "bold_promo":   return renderBoldPromo(input)
    case "scrapbook":    return renderScrapbook(input)
  }
}

// Direct-spawn runner. We bypass fluent-ffmpeg here because these commands
// mix `-loop 1` inputs with complex filtergraphs and lavfi color sources —
// fluent-ffmpeg's API assumes a simpler input/output model and mangles the
// arg order. Spawning the static binary directly is clearer and matches how
// the Python spec ports ran ffmpeg.
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = ffmpegStatic as string | null
    if (!bin) return reject(new Error("ffmpeg binary not available"))
    const child = spawn(bin, args)
    let stderr = ""
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString() })
    child.on("close", (code: number) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-2000)}`))
    })
    child.on("error", reject)
  })
}
