import { anthropic, BRIEF_MODEL } from "@/lib/ai/client"

// Classify a business upload so the ad pipeline can route it correctly
// (P2, from the first customer-ad post-mortem):
//   photo             → full-bleed scene material (the good case)
//   flyer             → designed poster/graphic with layered text. NEVER
//                       Ken-Burnsed as a scene; its text is extracted and
//                       fed to the script writer instead.
//   logo              → belongs on the end card, never a scene.
//   stock_watermarked → a licensing watermark is visible; flagged to the
//                       user (looks cheap AND may be unlicensed).
// Fails open to "photo": a classification hiccup must never block an upload.

export type UploadClass = "photo" | "flyer" | "logo" | "stock_watermarked"

export type UploadClassification = {
  contentClass: UploadClass
  // For flyers: the offer/date/contact text worth carrying into the script.
  extractedText: string | null
}

const CLASSIFY_PROMPT = `Look at this image a small business uploaded for a video ad and answer with ONLY a JSON object, no prose:
{"class": "photo" | "flyer" | "logo" | "stock_watermarked", "text": string | null}

Definitions:
- "photo": a photograph of products, food, a storefront, work, people, or places. Also photos that happen to contain some incidental text (a shop sign in frame is still a photo).
- "flyer": a DESIGNED promotional graphic — poster, menu card, sale announcement, social-media graphic — where laid-out text/graphics dominate.
- "logo": a brand mark/wordmark on a plain or simple background.
- "stock_watermarked": any image with a visible stock-photo licensing watermark (diagonal text, repeating brand names like shutterstock/getty/alamy, semi-transparent overlay text).

"text": ONLY for "flyer" — transcribe the key marketing text (offer, dates, product names, contact info), max 60 words, plain text. null for every other class.`

export async function classifyUpload(buffer: Buffer, mimeType: string): Promise<UploadClassification> {
  try {
    const mime = (mimeType.startsWith("image/") ? mimeType : "image/jpeg") as
      "image/jpeg" | "image/png" | "image/gif" | "image/webp"
    const msg = await anthropic.messages.create({
      model: BRIEF_MODEL,
      max_tokens: 300,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mime, data: buffer.toString("base64") } },
          { type: "text", text: CLASSIFY_PROMPT },
        ],
      }],
    })
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("")
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { contentClass: "photo", extractedText: null }
    const parsed = JSON.parse(jsonMatch[0]) as { class?: string; text?: string | null }
    const cls: UploadClass = ["photo", "flyer", "logo", "stock_watermarked"].includes(parsed.class ?? "")
      ? (parsed.class as UploadClass)
      : "photo"
    const extracted = cls === "flyer" && typeof parsed.text === "string" && parsed.text.trim()
      ? parsed.text.trim().slice(0, 500)
      : null
    return { contentClass: cls, extractedText: extracted }
  } catch (e) {
    console.warn(`[classify-upload] failed open to photo: ${(e as Error).message}`)
    return { contentClass: "photo", extractedText: null }
  }
}

// User-facing note per class, shown as a chip in the photo picker.
export const CLASS_NOTES: Record<UploadClass, string | null> = {
  photo: null,
  flyer: "Looks like a flyer — we'll use its text in the script, and your real photos on screen.",
  logo: "Looks like a logo — we'll place it on the end card instead of a scene.",
  stock_watermarked: "This image has a stock watermark — a clean photo will look much better.",
}
