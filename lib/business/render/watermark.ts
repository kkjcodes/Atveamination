import { runFfmpeg } from "@/lib/business/render/scene"
import { OUTPUT_FPS } from "@/lib/business/render/dimensions"
import { fitFontSize } from "@/lib/business/render/text-overlay"

// "Made with AtVe" outro appended to every render (BUSINESS-FORK-HANDOFF.md §4).
// 1.5s, music tail continues, no VO. Rendered on the fly as a solid tile
// (parchment tone for warmth) with brand mark drawtext — no external PNG
// dependency yet, so first-run doesn't need an artist to ship.

const OUTRO_SEC = 1.5

export async function renderWatermarkOutro(
  width: number,
  height: number,
  captionFontPath: string | null,
  outputPath: string,
): Promise<void> {
  const font = captionFontPath ? `fontfile='${captionFontPath}'` : `font='sans'`
  // Height-proportional sizing overflows the frame width on 9:16 (a 1920-tall
  // render gets a ~106px font, wider than 1080px for this line) — cap via
  // fitFontSize so the brand line always fits, and keep the tag proportional.
  const brandText = "Made with AtVe Animation"
  const brandSize = fitFontSize(brandText, width, Math.round(height * 0.055))
  const tagSize = Math.min(Math.round(height * 0.03), Math.round(brandSize * 0.6))
  const brandY = "(h-text_h)/2 - 20"
  const tagY = "(h-text_h)/2 + " + Math.round(height * 0.03)

  // Brand line uses "AtVe Animation" (spaced) rather than a mashed "AtVeAnimation"
  // — the mash-up was earlier truncated in on-frame rendering to just "AtVe".
  const vf = [
    `drawtext=text='${brandText}':${font}:fontsize=${brandSize}:fontcolor=0xF5EBDC:x=(w-text_w)/2:y=${brandY}`,
    `drawtext=text='atveanimation.com':${font}:fontsize=${tagSize}:fontcolor=0xF5EBDC@0.7:x=(w-text_w)/2:y=${tagY}`,
    `format=yuv420p`,
  ].join(",")

  await runFfmpeg([
    "-y", "-v", "error",
    "-f", "lavfi",
    "-i", `color=c=0x1C1917:s=${width}x${height}:r=${OUTPUT_FPS}:d=${OUTRO_SEC.toFixed(3)}`,
    "-vf", vf,
    "-t", OUTRO_SEC.toFixed(3),
    "-r", String(OUTPUT_FPS),
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    outputPath,
  ])
}

export const WATERMARK_OUTRO_SEC = OUTRO_SEC
