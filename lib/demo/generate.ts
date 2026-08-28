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

  // Explicit create-then-poll instead of the SDK's blocking run(): in prod
  // the SDK's internal wait intermittently stalled ~150s on calls the API
  // itself finishes in ~10s, blowing past Cloudflare's ~100s limit (seen
  // 2026-08-28 on the anime style). predictions.create/get stay on the
  // budget-gated adapter; the deadline keeps the route inside the edge
  // timeout with a friendly error instead of a blank 524.
  const t0 = Date.now()
  const step = (msg: string) => console.log(`[demo] ${demoId} ${msg} at ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  let pred = await replicate.predictions.create({
    model: MODELS.fluxKontextPro as `${string}/${string}`,
    input: {
      prompt: stylePrompt,
      input_image: dataUri,
      aspect_ratio: "1:1",
      output_format: "jpg",
    },
  })
  step(`prediction created (${style})`)
  const deadline = Date.now() + 75_000
  while (pred.status === "starting" || pred.status === "processing") {
    if (Date.now() > deadline) {
      step(`TIMED OUT in status ${pred.status}`)
      return { ok: false, status: 504, error: "That took longer than usual — please try again." }
    }
    await new Promise((r) => setTimeout(r, 1000))
    pred = await replicate.predictions.get(pred.id)
  }
  step(`prediction ${pred.status}`)
  if (pred.status !== "succeeded" || !pred.output) {
    return { ok: false, status: 502, error: "That didn't work this time — give it another try in a moment." }
  }
  const replicateUrl = Array.isArray(pred.output) ? String(pred.output[0]) : String(pred.output)
  const res = await fetch(replicateUrl)
  if (!res.ok) throw new Error(`demo result fetch failed: ${res.status}`)
  const resultUrl = await uploadBlob(`demo/${demoId}/result.jpg`, Buffer.from(await res.arrayBuffer()), "image/jpeg")
  step("result stored")

  return { ok: true, demoId, sourceUrl, resultUrl }
}
