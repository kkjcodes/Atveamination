import { createHmac, timingSafeEqual } from "crypto"
import type { NextRequest } from "next/server"

const REPLAY_TOLERANCE_SECONDS = 300 // 5-minute window

// Replicate uses the Standard Webhooks spec:
// signature = base64(HMAC-SHA256(key, "{webhook-id}.{webhook-timestamp}.{rawBody}"))
// Secret is a whsec_-prefixed base64 string set via REPLICATE_WEBHOOK_SECRET.
export function verifyReplicateSignature(rawBody: string, headers: Headers): boolean {
  const secret = process.env.REPLICATE_WEBHOOK_SECRET
  if (!secret) {
    console.error("[webhook] REPLICATE_WEBHOOK_SECRET not set — rejecting")
    return false
  }

  const id        = headers.get("webhook-id")
  const timestamp = headers.get("webhook-timestamp")
  const signature = headers.get("webhook-signature")
  if (!id || !timestamp || !signature) return false

  const ts = parseInt(timestamp, 10)
  if (isNaN(ts) || Math.abs(Date.now() / 1000 - ts) > REPLAY_TOLERANCE_SECONDS) return false

  const key      = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const toSign   = `${id}.${timestamp}.${rawBody}`
  const expected = createHmac("sha256", key).update(toSign).digest("base64")

  // Header may contain multiple space-separated "v1,{sig}" entries
  return signature.split(" ").some((entry) => {
    const [version, value] = entry.split(",", 2)
    if (version !== "v1" || !value) return false
    try {
      return timingSafeEqual(Buffer.from(value, "base64"), Buffer.from(expected, "base64"))
    } catch {
      return false
    }
  })
}

// fal.ai doesn't sign webhook payloads, so we embed a shared secret in the
// webhook URL (?secret=...) and verify it here with a constant-time compare.
export function verifyFalSecret(req: NextRequest): boolean {
  const secret   = process.env.WEBHOOK_SECRET
  if (!secret) {
    console.error("[webhook] WEBHOOK_SECRET not set — rejecting")
    return false
  }
  const provided = req.nextUrl.searchParams.get("secret") ?? ""
  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(secret))
  } catch {
    return false
  }
}
