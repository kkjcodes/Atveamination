import sharp from "sharp"

// Dominant saturated color from the business logo → bold_promo band color.
// Falls back to null (caller keeps the palette-hint color) when the logo is
// effectively grayscale — a gray band reads as broken, not branded.

export function pickDominantHex(
  pixels: Uint8Array | Buffer,
  channels: number,
): string | null {
  // Quantize to 3 bits/channel; score each bucket by saturation-weighted count.
  const buckets = new Map<number, { score: number; r: number; g: number; b: number; n: number }>()
  for (let i = 0; i + channels <= pixels.length; i += channels) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2]
    const a = channels === 4 ? pixels[i + 3] : 255
    if (a < 128) continue // transparent logo padding
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    const sat = max === 0 ? 0 : (max - min) / max
    const val = max / 255
    if (sat < 0.25 || val < 0.15 || val > 0.97) continue // skip gray/near-black/near-white
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5)
    const entry = buckets.get(key) ?? { score: 0, r: 0, g: 0, b: 0, n: 0 }
    entry.score += sat * val
    entry.r += r; entry.g += g; entry.b += b; entry.n += 1
    buckets.set(key, entry)
  }
  let best: { score: number; r: number; g: number; b: number; n: number } | null = null
  for (const entry of buckets.values()) {
    if (!best || entry.score > best.score) best = entry
  }
  if (!best || best.n === 0) return null
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, "0")
  return `0x${hex(best.r / best.n)}${hex(best.g / best.n)}${hex(best.b / best.n)}`.toUpperCase().replace("0X", "0x")
}

export async function dominantColorHex(imagePath: string): Promise<string | null> {
  try {
    const { data, info } = await sharp(imagePath)
      .resize(32, 32, { fit: "inside" })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    return pickDominantHex(data, info.channels)
  } catch {
    return null
  }
}
