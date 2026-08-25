import { createHash } from "crypto"
import sharp from "sharp"
import { replicate, MODELS, CARTOON_STYLE_PROMPTS } from "@/lib/replicate/client"
import { screenPublicFigure } from "@/lib/ai/likeness-screen"
import { uploadBlob } from "@/lib/storage/client"
import { rateLimit } from "@/lib/rate-limit"

// Anonymous try-it demo (task B1): one photo in, one cartoon out, no account.
// Everything here is defensive because the caller is unauthenticated:
//   - per-hashed-IP and global daily ceilings (in-memory rateLimit — resets
//     on container restart, which is acceptable: the budget guard still caps
//     dollars, these caps just keep one visitor from being greedy)
//   - EXIF normalized AND stripped before the model sees pixels (iPhone
//     orientation=6 causes catastrophic identity drift — long-standing rule)
//   - the same likeness screen as character upload (never ask the model to
//     NAME the person — that triggers a face-ID refusal and fails open)
//   - uploads live under demo/ and are swept after 24h

export const DEMO_STYLES = ["pixar", "anime", "comic", "watercolor"] as const
export type DemoStyle = typeof DEMO_STYLES[number]

const PER_IP_PER_DAY = 10
const GLOBAL_PER_DAY = 300
const DAY_MS = 24 * 60 * 60 * 1000

export function hashIp(ip: string): string {
  const salt = process.env.NEXTAUTH_SECRET ?? "demo-salt"
  return createHash("sha256").update(salt).update("|").update(ip).digest("hex").slice(0, 24)
}

export type DemoRefusal = { ok: false; status: number; error: string }
export type DemoSuccess = { ok: true; demoId: string; sourceUrl: string; resultUrl: string }

export async function generateDemo(
  file: { buffer: Buffer; mimeType: string },
  ip: string,
  style: DemoStyle,
): Promise<DemoRefusal | DemoSuccess> {
  const ipHash = hashIp(ip)

  const perIp = rateLimit(`demo:ip:${ipHash}`, PER_IP_PER_DAY, DAY_MS)
  if (!perIp.allowed) {
    return { ok: false, status: 429, error: "You've used today's free previews. Sign up free to keep going — or come back tomorrow." }
  }
  const global = rateLimit("demo:global", GLOBAL_PER_DAY, DAY_MS)
  if (!global.allowed) {
    return { ok: false, status: 503, error: "The free preview is taking a breather today. Sign up free and make videos instead — or try again tomorrow." }
  }

  // Normalize: bake EXIF rotation into pixels, strip metadata, bound size.
  let normalized: Buffer
  try {
    normalized = await sharp(file.buffer)
      .rotate()
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer()
  } catch {
    return { ok: false, status: 400, error: "We couldn't read that image. Try a JPG or PNG photo." }
  }

  // Likeness screen — same policy as character upload.
  const screen = await screenPublicFigure(normalized, "image/jpeg")
  if (screen.block) {
    return { ok: false, status: 422, error: "That looks like a public figure. Please use a photo of yourself, or of someone who's given you permission." }
  }

  const demoId = crypto.randomUUID()
  const sourceUrl = await uploadBlob(`demo/${demoId}/source.jpg`, normalized, "image/jpeg")

  const stylePrompt = CARTOON_STYLE_PROMPTS[style] ?? CARTOON_STYLE_PROMPTS.pixar
  const dataUri = `data:image/jpeg;base64,${normalized.toString("base64")}`
  const output = await replicate.run(MODELS.fluxKontextPro, {
    input: {
      prompt: stylePrompt,
      input_image: dataUri,
      aspect_ratio: "1:1",
      output_format: "jpg",
    },
  })
  const replicateUrl = Array.isArray(output) ? String(output[0]) : String(output)
  const res = await fetch(replicateUrl)
  if (!res.ok) throw new Error(`demo result fetch failed: ${res.status}`)
  const resultUrl = await uploadBlob(`demo/${demoId}/result.jpg`, Buffer.from(await res.arrayBuffer()), "image/jpeg")

  return { ok: true, demoId, sourceUrl, resultUrl }
}
