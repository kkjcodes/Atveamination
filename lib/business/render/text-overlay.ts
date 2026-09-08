import { BRAND } from "@/config/brand"
import type { AdScript, TextPosition } from "@/lib/business/adscript-schema"

// ffmpeg drawtext requires escaping. Kept in one place so every template
// family gets consistent behavior. `:` `\` `'` and `%` are the picky ones.
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "")
    .replace(/'/g, "’")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ")
}

// Y-coordinate for overlay text given a text_position + output height.
// Height is scene-height, not output; templates may prefer to overlay onto
// the full-frame after motion (natural) vs. margin from top (rare).
export function overlayY(pos: TextPosition, height: number): string {
  switch (pos) {
    case "upper_third":  return String(Math.round(height * 0.18))
    case "center":       return "(h-text_h)/2"
    case "lower_third":  return String(Math.round(height * 0.72))
  }
}

// Font sizing scales with height so text stays proportional across aspects.
// The three template families each pick a base size; motion filters don't
// affect this.
export function baseFontSize(height: number): number {
  // 1080-tall wide gets ~72px; 1920-tall vertical gets ~92px (readable on phone).
  return Math.round(height * 0.06)
}

// DejaVu Sans characters average ~62% of font size in width (measured empirically
// on the fontfile Alpine's ttf-dejavu ships). Slight overestimate so text with
// wide chars ("W", "M") still fits.
const AVG_CHAR_WIDTH_RATIO = 0.62
// Boxed drawtext also draws boxborderw=24 padding on each side, so we lose
// 48px total to that. Add ~80px cosmetic margin. Effective usable width for
// text is roughly frameWidth - 128.
const BOX_PADDING = 48
const COSMETIC_MARGIN = 80

// Return a font size that will render `text` inside `frameWidth`, never larger
// than `maxSize` (the family's aesthetic base). Prevents the "overlay text
// clipped off both sides" bug on 9:16 renders where the base size assumes
// short text but AdScripts push right up against the word cap (e.g. a 12-word
// benefit line at 40+ chars is wider than 1080px at the default 115px size).
export function fitFontSize(text: string, frameWidth: number, maxSize: number): number {
  if (!text.length) return maxSize
  const usable = Math.max(200, frameWidth - BOX_PADDING - COSMETIC_MARGIN)
  const sizeByFit = Math.floor(usable / (text.length * AVG_CHAR_WIDTH_RATIO))
  return Math.max(24, Math.min(maxSize, sizeByFit))
}

// Usable text width inside the caption box, at a given frame width.
export function usableTextWidth(frameWidth: number): number {
  return Math.max(200, frameWidth - BOX_PADDING - COSMETIC_MARGIN)
}

// Does `text` fit on ONE line within `frameWidth` at `fontSize`?
export function lineFits(text: string, frameWidth: number, fontSize: number): boolean {
  return text.length * AVG_CHAR_WIDTH_RATIO * fontSize <= usableTextWidth(frameWidth)
}

// Greedy word-wrap `text` into lines that each fit within `frameWidth` at
// `fontSize`. A single word longer than the line is left whole (better one
// over-wide rare word than a mid-word chop) — but the caller shrinks the size
// until even that fits, so in practice every line fits. Pure + deterministic.
export function wrapToWidth(text: string, frameWidth: number, fontSize: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return []
  const lines: string[] = []
  let cur = ""
  for (const w of words) {
    const candidate = cur ? `${cur} ${w}` : w
    if (cur && !lineFits(candidate, frameWidth, fontSize)) {
      lines.push(cur)
      cur = w
    } else {
      cur = candidate
    }
  }
  if (cur) lines.push(cur)
  return lines
}

// Lay out a caption so EVERY line fits within the frame — no overflow ever,
// regardless of caption length. This replaces the old 2-line-max split that
// silently clipped long captions off both edges (the 2026-09-08 regression).
//
// Strategy: start at the aesthetic size, wrap to width; if that needs more
// than `maxLines`, step the size down and re-wrap until it fits within the
// line budget or hits the readable floor. Returns the final lines + size,
// with a hard guarantee that each returned line fits at the returned size.
export function layoutCaption(
  text: string,
  frameWidth: number,
  frameHeight: number,
  maxLines = 3,
): { lines: string[]; fontSize: number } {
  const clean = text.trim()
  if (!clean) return { lines: [], fontSize: Math.round(frameHeight * 0.032) }
  const startSize = Math.round(frameHeight * 0.032) // ~61px on 1920
  const floor = Math.max(18, Math.round(frameHeight * 0.018)) // ~35px on 1920
  let size = startSize
  let lines = wrapToWidth(clean, frameWidth, size)
  while (lines.length > maxLines && size > floor) {
    size = Math.max(floor, size - 2)
    lines = wrapToWidth(clean, frameWidth, size)
  }
  // Final safety: if any single line still doesn't fit at this size (a very
  // long word, or we hit the floor with too many words), shrink until the
  // widest line fits. Guarantees the render invariant the tests assert.
  while (lines.some((l) => !lineFits(l, frameWidth, size)) && size > 12) {
    size -= 1
    lines = wrapToWidth(clean, frameWidth, size)
  }
  return { lines, fontSize: size }
}

// Build a per-scene drawtext filter fragment. Returns a string that can be
// appended to a filter chain (comma-separated). Null-guards missing font.
export function drawtextFragment(
  text: string,
  position: TextPosition,
  outWidth: number,
  outHeight: number,
  fontPath: string | null,
  fontColor: string = "0xF5F5F0",
  boxColor: string | null = "0x0000007F",
): string {
  const escaped = escapeDrawtext(text)
  const font = fontPath ? `fontfile='${fontPath}'` : `font='sans'`
  const y = overlayY(position, outHeight)
  const size = fitFontSize(text, outWidth, baseFontSize(outHeight))
  const parts = [
    `text='${escaped}'`,
    font,
    `fontsize=${size}`,
    `fontcolor=${fontColor}`,
    `x=(w-text_w)/2`,
    `y=${y}`,
    `borderw=2`,
    `bordercolor=0x00000060`,
  ]
  if (boxColor) {
    parts.push(`box=1`, `boxcolor=${boxColor}`, `boxborderw=24`)
  }
  return `drawtext=${parts.join(":")}`
}

// End card takes a list of lines and stacks them centered. We render one
// drawtext per line stacked vertically so line spacing is even.
export function endCardStack(
  lines: string[],
  outWidth: number,
  outHeight: number,
  fontPath: string | null,
): string {
  const maxSize = baseFontSize(outHeight)
  // Size each line individually so the longest line drives the constraint;
  // shorter lines still get the family's base aesthetic size.
  const sizes = lines.map((line, i) => {
    const rawMax = i === 0 ? Math.round(maxSize * 1.3) : maxSize
    return fitFontSize(line, outWidth, rawMax)
  })
  const totalHeight = sizes.reduce((sum, s) => sum + s + 20, 0)
  const startY = Math.round((outHeight - totalHeight) / 2)
  let cursorY = startY
  const stack = lines
    .map((line, i) => {
      const escaped = escapeDrawtext(line)
      const font = fontPath ? `fontfile='${fontPath}'` : `font='sans'`
      const lineSize = sizes[i]
      const y = cursorY
      cursorY += lineSize + 20
      return `drawtext=text='${escaped}':${font}:fontsize=${lineSize}:fontcolor=0xF5F5F0:x=(w-text_w)/2:y=${y}:borderw=2:bordercolor=0x00000060`
    })
    .join(",")
  // Small maker credit replacing the old full-screen outro card — the
  // customer's brand keeps the final frame, we keep a quiet corner line.
  // Bottom-center: the QR (when present) owns the bottom-right corner.
  const creditFont = fontPath ? `fontfile='${fontPath}'` : `font='sans'`
  const creditSize = Math.max(14, Math.round(outHeight * 0.014))
  const creditY = outHeight - creditSize - Math.round(outHeight * 0.014)
  const credit = `drawtext=text='${BRAND.videoCredit}':${creditFont}:fontsize=${creditSize}:fontcolor=0xFFFFFF@0.45:x=(w-text_w)/2:y=${creditY}`
  return `${stack},${credit}`
}

// Extract the burned overlay text for a scene by type. end_card lines are
// handled separately via endCardStack; hook/benefit/cta use `text`.
export function overlayTextForScene(scene: AdScript["scenes"][number]): string | null {
  if (scene.type === "end_card") return null
  return scene.text || null
}

// Burned-in narration subtitle: small boxed line pinned to the bottom of the
// frame (Reels norm — most viewers watch muted). `bottomReserved` lifts the
// caption above anything already occupying the bottom of the frame (the
// bold_promo band). Distinct from the headline overlay: headline is the short
// punch line, caption is the spoken sentence.
// Split a long caption into up to two balanced lines at a word boundary.
// Long narration sentences (~20+ words) hit fitFontSize's 24px floor as a
// single line and overflow the frame edges (seen on the Ridgeview demo).
export function splitCaption(text: string): string[] {
  const words = text.trim().split(/\s+/)
  if (words.length < 2 || text.length <= 48) return [text.trim()]
  let best = 1
  let bestDiff = Infinity
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length
    const b = words.slice(i).join(" ").length
    const diff = Math.abs(a - b)
    if (diff < bestDiff) { bestDiff = diff; best = i }
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")]
}

// Perceived-luminance check for picking legible text on a colored ground.
export function isLightHex(hex: string): boolean {
  const h = hex.replace(/^0x/i, "").replace(/^#/, "")
  if (h.length < 6) return false
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  if ([r, g, b].some(Number.isNaN)) return false
  return 0.299 * r + 0.587 * g + 0.114 * b > 150
}

// Fraction of frame height kept clear at the BOTTOM for platform UI (IG/TikTok
// caption + music ticker + button rail). Research: keep ≥ ~500px clear on a
// 1920-tall frame (~26%). The caption block's lowest pixel sits at or above
// this line — the 2026-09-08 fix for captions rendered under the platform UI.
export const CAPTION_BOTTOM_SAFE_FRAC = 0.26

// Y of the lowest caption line's box-top, given how many lines and their size.
// Exported so the render-QC test can assert the whole block stays in the safe
// zone without re-deriving the geometry.
export function captionBlockTopY(
  outHeight: number,
  fontSize: number,
  lineCount: number,
  lineGap: number,
  bottomReserved: number,
): number {
  const safeBottom = Math.max(bottomReserved, Math.round(outHeight * CAPTION_BOTTOM_SAFE_FRAC))
  const lowestLineTop = outHeight - safeBottom - fontSize
  const blockHeight = lineCount * fontSize + (lineCount - 1) * lineGap
  return lowestLineTop - (blockHeight - fontSize)
}

export function captionFragment(
  text: string,
  outWidth: number,
  outHeight: number,
  fontPath: string | null,
  bottomReserved: number = 0,
  // Brand/palette hex ("0xRRGGBB") → caption renders as a compact brand-color
  // pill instead of the flat black box (post-mortem: the black band read as
  // unbranded). Null keeps the black-box look.
  accentHex: string | null = null,
): string {
  const font = fontPath ? `fontfile='${fontPath}'` : `font='sans'`
  // layoutCaption guarantees every line fits within the frame at `fontSize`
  // (no more clipped-off-both-edges captions), wrapping to up to 3 lines and
  // shrinking as needed.
  const { lines, fontSize } = layoutCaption(text, outWidth, outHeight)
  if (lines.length === 0) return ""
  const lineGap = Math.round(fontSize * 0.4)
  const boxColor = accentHex ? `${accentHex}@0.88` : "0x00000080"
  const fontColor = accentHex && isLightHex(accentHex) ? "0x1A1A1A" : "0xFFFFFF"

  // Anchor the block so its lowest line clears the platform UI safe zone.
  const topY = captionBlockTopY(outHeight, fontSize, lines.length, lineGap, bottomReserved)
  return lines
    .map((line, i) => {
      const y = topY + i * (fontSize + lineGap)
      return `drawtext=text='${escapeDrawtext(line)}':${font}:fontsize=${fontSize}:fontcolor=${fontColor}:x=(w-text_w)/2:y=${y}:box=1:boxcolor=${boxColor}:boxborderw=14`
    })
    .join(",")
}

// Small persistent contact chip pinned near the top of every scene (opt-in).
export function contactStripFragment(
  text: string,
  outWidth: number,
  outHeight: number,
  fontPath: string | null,
): string {
  const escaped = escapeDrawtext(text)
  const font = fontPath ? `fontfile='${fontPath}'` : `font='sans'`
  const size = fitFontSize(text, outWidth, Math.round(outHeight * 0.026))
  const y = Math.round(outHeight * 0.035)
  return `drawtext=text='${escaped}':${font}:fontsize=${size}:fontcolor=0xFFFFFF:x=(w-text_w)/2:y=${y}:box=1:boxcolor=0x00000066:boxborderw=10`
}
