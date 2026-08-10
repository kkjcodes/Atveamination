import { anthropic, VISION_MODEL } from "./client"
import { decideFromScreen, type LikenessScreenResult } from "./likeness-screen-decision"

export { decideFromScreen }
export type { LikenessScreenResult }

// Public-figure screen at character upload. Legal context: using a
// recognizable person's likeness in an AD without consent is a right-of-
// publicity violation, and a generative tool that produces the likeness has
// weak platform defenses. Blocking obvious celebrities at the door removes
// the worst-case scenario (a famous face fronting a user's ad).
//
// Decision policy: block ONLY on high-confidence recognition — a real user
// who merely resembles someone famous must never be locked out. Screen
// failures fail OPEN (availability over screening) and are logged.

// Prompt design note: the first version asked the model to NAME the person,
// which triggers the model's face-identification refusal — the response then
// contains no JSON and the fail-open path silently allows everything (caught
// by the prod test matrix: 3 celebrity uploads sailed through). This version
// asks a yes/no recognizability question WITHOUT identification, which the
// model answers consistently (10/10 in direct API testing).
const SCREEN_PROMPT = `You are a content-safety screen for a video app. Without identifying or naming anyone, answer one question: does this photo appear to depict a widely recognizable public figure (such as a well-known politician, entertainer, musician, or athlete)?

This is a yes/no recognizability check for likeness-rights protection — do NOT state who the person is or any identifying details.

Answer ONLY with JSON: {"public_figure": true or false, "confidence": "high" or "medium" or "low"}

"high" means you are quite sure this is a specific famous person, even though you are not naming them. Ordinary people who merely resemble someone famous are not public figures.`

export async function screenPublicFigure(imageBuffer: Buffer, mimeType: string): Promise<LikenessScreenResult> {
  try {
    const msg = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 200,
      messages: [{
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: (mimeType.startsWith("image/") ? mimeType : "image/jpeg") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: imageBuffer.toString("base64"),
            },
          },
          { type: "text", text: SCREEN_PROMPT },
        ],
      }],
    })
    const text = msg.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("")
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      // A refusal or free-text answer means the screen didn't run — surface
      // it loudly instead of silently allowing.
      console.warn("[likeness-screen] no JSON in response, allowing:", text.slice(0, 120))
      return { block: false }
    }
    const parsed = JSON.parse(jsonMatch[0])
    const result = decideFromScreen(parsed)
    console.log("[likeness-screen]", result.block ? "BLOCKED" : "allowed", JSON.stringify(parsed))
    return result
  } catch (e) {
    console.error("[likeness-screen] failed open:", (e as Error)?.message)
    return { block: false }
  }
}
