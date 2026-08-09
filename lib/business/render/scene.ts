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
  captionFragment,
  contactStripFragment,
  splitCaption,
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
  // Burned-in narration subtitle (clean_modern + bold_promo; scrapbook keeps
  // its handwritten aesthetic uncluttered).
  captionText?: string | null
  // Persistent phone chip near the top of non-end-card scenes (opt-in).
  contactStripText?: string | null
  // Pre-rendered QR PNG composited onto the end card's bottom-right corner.
  qrPngPath?: string | null
}

// End cards optionally composite a QR PNG bottom-right. One shared arg
// builder so all three templates treat the QR identically.
function endCardFfmpegArgs(
  inputArgs: string[],       // args producing input [0:v] (photo/color source)
  baseFilter: string,        // filter chain for [0:v] (motion + text stack)
  qrPngPath: string | null | undefined,
  width: number,
  height: number,
  durationSec: number,
  outputPath: string,
): string[] {
  const tail = [
    "-t", durationSec.toFixed(3),
    "-r", String(OUTPUT_FPS),
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    outputPath,
  ]
  if (!qrPngPath) {
    return ["-y", "-v", "error", ...inputArgs, "-vf", `${baseFilter},format=yuv420p`, ...tail]
  }
  const qrSize = Math.round(Math.min(width, height) * 0.18)
  const margin = Math.round(Math.min(width, height) * 0.04)
  const complex = [
    `[0:v]${baseFilter}[base]`,
    `[1:v]scale=${qrSize}:${qrSize}[qr]`,
    `[base][qr]overlay=${width - qrSize - margin}:${height - qrSize - margin},format=yuv420p[v]`,
  ].join(";")
  return ["-y", "-v", "error", ...inputArgs, "-i", qrPngPath, "-filter_complex", complex, "-map", "[v]", ...tail]
}

// clean_modern: full-bleed photo with motion + lower-third caption.
async function renderCleanModern(input: SceneRenderInput): Promise<void> {
  const { scene, sourceImagePath, durationSec, outputPath, width, height, captionFontPath, textPosition } = input
  const motion = scene.type === "end_card" ? "hold" : scene.motion
  const motionFilter = buildMotionFilter(motion, durationSec, width, height)

  if (scene.type === "end_card") {
    const stack = endCardStack(scene.lines, width, height, captionFontPath)
    await runFfmpeg(endCardFfmpegArgs(
      ["-loop", "1", "-i", sourceImagePath],
      `${motionFilter},${stack}`,
      input.qrPngPath,
      width, height, durationSec, outputPath,
    ))
    return
  }

  // ONE text element on screen (user-reported UX: headline + caption at once
  // reads as two competing messages). Captions on → the narration caption
  // carries the words; captions off → the short headline.
  const text = overlayTextForScene(scene)
  const extras = [
    input.captionText
      ? captionFragment(input.captionText, width, height, captionFontPath)
      : text ? drawtextFragment(text, textPosition, width, height, captionFontPath) : null,
    input.contactStripText ? contactStripFragment(input.contactStripText, width, height, captionFontPath) : null,
  ].filter(Boolean)
  const filter = [motionFilter, ...extras, "format=yuv420p"].join(",")

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

  if (scene.type === "end_card") {
    const stack = endCardStack(scene.lines, width, height, captionFontPath)
    await runFfmpeg(endCardFfmpegArgs(
      ["-loop", "1", "-i", sourceImagePath],
      `${motionFilter},${stack}`,
      input.qrPngPath,
      width, height, durationSec, outputPath,
    ))
    return
  }

  // ONE text in the band: the narration caption when captions are on (split
  // to two lines, smaller face), else the short headline. Never both a band
  // headline AND a bottom caption (user-reported double-text UX).
  const displayText = input.captionText || overlayTextForScene(scene) || ""
  const band = `drawbox=x=0:y=${bandY}:w=${width}:h=${bandH}:color=${paletteBgHex}@0.85:t=fill`
  const font = captionFontPath ? `fontfile='${captionFontPath}'` : `font='sans'`
  const lines = input.captionText ? splitCaption(displayText) : [displayText]
  const maxLineSize = Math.round(height * (input.captionText ? 0.042 : 0.08))
  const fontSize = Math.min(...lines.map((l) => fitFontSize(l, width, maxLineSize)))
  const lineGap = Math.round(fontSize * 0.4)
  const blockH = lines.length * fontSize + (lines.length - 1) * lineGap
  const startY = bandY + Math.round((bandH - blockH) / 2)
  const drawtexts = lines.map((line, i) => {
    const y = startY + i * (fontSize + lineGap)
    return `drawtext=text='${escapeDrawtext(line)}':${font}:fontsize=${fontSize}:fontcolor=0xF5F5F0:x=(w-text_w)/2:y=${y}:borderw=3:bordercolor=0x00000080`
  })
  const extras = [
    input.contactStripText ? contactStripFragment(input.contactStripText, width, height, captionFontPath) : null,
  ].filter(Boolean)
  const filter = [motionFilter, band, ...drawtexts, ...extras, "format=yuv420p"].join(",")

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
    await runFfmpeg(endCardFfmpegArgs(
      ["-f", "lavfi", "-i", `color=c=0xF5EBDC:s=${width}x${height}:r=${OUTPUT_FPS}:d=${durationSec.toFixed(3)}`],
      stack,
      input.qrPngPath,
      width, height, durationSec, outputPath,
    ))
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

// Presenter scene: a lip-synced video clip takes the photo's place. Same
// blur-fill treatment as photos (16:9 clip inside any ad aspect), same
// template overlays. Clip audio is stripped — narration flows through the
// normal audio mix so ducking/loudnorm apply. If the clip is shorter than the
// scene, the last frame holds (tpad clone).
// v1: clean_modern + bold_promo only (scrapbook's parchment collage would
// clash with a full-bleed presenter).
export async function renderPresenterScene(
  input: SceneRenderInput & { clipPath: string },
): Promise<void> {
  const { scene, clipPath, durationSec, outputPath, width, height, captionFontPath, paletteBgHex, textPosition } = input
  if (scene.type === "end_card") throw new Error("presenter scene cannot be an end_card")

  const normalize = [
    `split=2[pf_bg][pf_fg]`,
    `[pf_bg]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},boxblur=32:2[pf_bgb]`,
    `[pf_fg]scale=${width}:${height}:force_original_aspect_ratio=decrease[pf_fgs]`,
    `[pf_bgb][pf_fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,tpad=stop_mode=clone:stop=-1`,
  ].join(";")

  const text = overlayTextForScene(scene)
  const overlays: string[] = []
  if (input.templateFamily === "bold_promo" && (input.captionText || text)) {
    const bandH = Math.round(height * 0.28)
    const bandY = height - bandH - Math.round(height * 0.05)
    const font = captionFontPath ? `fontfile='${captionFontPath}'` : `font='sans'`
    const displayText = input.captionText || text || ""
    const lines = input.captionText ? splitCaption(displayText) : [displayText]
    const maxLineSize = Math.round(height * (input.captionText ? 0.042 : 0.08))
    const fontSize = Math.min(...lines.map((l) => fitFontSize(l, width, maxLineSize)))
    const lineGap = Math.round(fontSize * 0.4)
    const blockH = lines.length * fontSize + (lines.length - 1) * lineGap
    const startY = bandY + Math.round((bandH - blockH) / 2)
    overlays.push(`drawbox=x=0:y=${bandY}:w=${width}:h=${bandH}:color=${paletteBgHex}@0.85:t=fill`)
    for (let i = 0; i < lines.length; i++) {
      const y = startY + i * (fontSize + lineGap)
      overlays.push(`drawtext=text='${escapeDrawtext(lines[i])}':${font}:fontsize=${fontSize}:fontcolor=0xF5F5F0:x=(w-text_w)/2:y=${y}:borderw=3:bordercolor=0x00000080`)
    }
  } else if (input.captionText) {
    overlays.push(captionFragment(input.captionText, width, height, captionFontPath))
  } else if (text) {
    overlays.push(drawtextFragment(text, textPosition, width, height, captionFontPath))
  }
  if (input.contactStripText) overlays.push(contactStripFragment(input.contactStripText, width, height, captionFontPath))

  const filter = [normalize, ...overlays, "format=yuv420p"].join(",")
  await runFfmpeg([
    "-y", "-v", "error",
    "-i", clipPath,
    "-vf", filter,
    "-an",
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
