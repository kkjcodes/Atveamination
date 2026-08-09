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
  return lines
    .map((line, i) => {
      const escaped = escapeDrawtext(line)
      const font = fontPath ? `fontfile='${fontPath}'` : `font='sans'`
      const lineSize = sizes[i]
      const y = cursorY
      cursorY += lineSize + 20
      return `drawtext=text='${escaped}':${font}:fontsize=${lineSize}:fontcolor=0xF5F5F0:x=(w-text_w)/2:y=${y}:borderw=2:bordercolor=0x00000060`
    })
    .join(",")
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

export function captionFragment(
  text: string,
  outWidth: number,
  outHeight: number,
  fontPath: string | null,
  bottomReserved: number = 0,
): string {
  const font = fontPath ? `fontfile='${fontPath}'` : `font='sans'`
  const lines = splitCaption(text)
  const size = Math.min(...lines.map((l) => fitFontSize(l, outWidth, Math.round(outHeight * 0.032))))
  const margin = Math.round(outHeight * 0.02)
  const lineGap = Math.round(size * 0.45)
  // Stack from the bottom up.
  return lines
    .map((line, i) => {
      const fromBottom = (lines.length - 1 - i) * (size + lineGap)
      const y = outHeight - bottomReserved - margin - size - fromBottom
      return `drawtext=text='${escapeDrawtext(line)}':${font}:fontsize=${size}:fontcolor=0xFFFFFF:x=(w-text_w)/2:y=${y}:box=1:boxcolor=0x00000080:boxborderw=12`
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
