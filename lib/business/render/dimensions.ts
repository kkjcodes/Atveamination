import type { AspectRatio } from "@/lib/business/adscript-schema"

// Output dimensions per aspect ratio. Kept small so render time stays under
// the M4 gate (< 90s on the deploy box). 1080p vertical/square, 1920x1080
// wide — all fit within Container Apps CPU budget without pushing quality
// downgrades to visible territory.
export function dimensionsFor(aspect: AspectRatio): { width: number; height: number } {
  switch (aspect) {
    case "9:16": return { width: 1080, height: 1920 }
    case "1:1":  return { width: 1080, height: 1080 }
    case "16:9": return { width: 1920, height: 1080 }
  }
}

// FPS is uniform across the fork — 30fps is the social platform default.
// Higher costs more render time; lower is visibly choppy on motion filters.
export const OUTPUT_FPS = 30
