import { anthropic, VISION_MODEL } from "./client"

// Fetches a remote image into a base64 buffer suitable for Anthropic vision input.
async function fetchAsBuffer(url: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not fetch image: ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const mimeType = res.headers.get("content-type") ?? "image/jpeg"
  return { buffer, mimeType }
}

// Generates a concise, prompt-injectable description of the person in a photo.
// Output is engineered to anchor downstream image generation (style transfer,
// LoRA training augmentations, scene generation) on identity-critical features.
// Kept short and concrete — verbose descriptions cause Kontext Pro to drift or
// hallucinate; specific named features dramatically improve identity preservation.
export async function describeCharacter(imageBuffer: Buffer, mimeType: string): Promise<string | null> {
  try {
    const media_type = (
      mimeType === "image/png" || mimeType === "image/gif" || mimeType === "image/webp"
        ? mimeType
        : "image/jpeg"
    ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp"

    const msg = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 250,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type, data: imageBuffer.toString("base64") } },
          {
            type: "text",
            text: `Describe this specific person's identity-anchoring features for a cartoon rendering pipeline. Be precise about features that distinguish THIS person — accuracy matters more than brevity.

Include in this order:
1. Apparent gender
2. Approximate age (give a specific decade — "early 40s" not "adult"; under-aging causes downstream cartoon renderings to skew youthful)
3. Ethnicity / skin tone — be PRECISE. Don't say "medium brown" generically; characterise on a scale ("very light", "light", "light-medium", "medium", "medium-deep", "deep", "very deep") and note any reddish, yellow, olive, or cool undertones. Skin tone is the feature most often misrendered by downstream cartoon generation — accuracy here matters most.
4. Hair: length, color, texture, style
5. Facial hair: be specific ("clean-shaven", "light stubble", "short beard", "full beard"); say "clean-shaven" if absent
6. Eyewear: style ("wire-rim oval glasses", "thick-frame square glasses", "rimless") or "no glasses"
7. ONLY mention a feature in this category if it is CLEARLY visible in the photo: prominent moles, scars, freckles, tattoos, distinguishing face shape (e.g. "long oval face", "square jaw"). Do NOT enumerate or assume any feature based on apparent ethnicity, religion, or cultural background. Do NOT add markings, jewelry, or accessories that you cannot see. If nothing distinctive is visible, omit this point entirely.

Rules:
- Only describe what is CLEARLY visible. Do NOT guess. When in doubt, leave it out.
- Do NOT describe clothing — it will change per scene.
- Do NOT describe background, expression, or pose.
- Be culture-neutral: describe what is in the photo, not what you assume based on ethnicity.
- Output a comma-separated list of descriptors. Examples: "man, early 40s, light-medium skin, short black wavy hair, light stubble, oval wire-rim glasses" or "woman, late 20s, fair skin with cool undertones, long auburn straight hair, clean-shaven, no glasses".

Output only the descriptor list — no preamble, no markdown.`,
          },
        ],
      }],
    })

    const block = msg.content[0]
    if (block.type !== "text") return null
    const text = block.text.trim()
    return text.length > 0 ? text : null
  } catch (e) {
    console.error("[describeCharacter] failed:", (e as Error)?.message)
    return null
  }
}

// Extracts the visual cues from scene 0's keyframe that should persist across
// subsequent scenes — clothing, hair styling, accessories, body proportions.
// These get injected into prompts for scenes 1-N so characters don't swap
// outfits or change hair length between cuts.
export async function describeFirstFrame(imageUrl: string): Promise<string | null> {
  try {
    const { buffer, mimeType } = await fetchAsBuffer(imageUrl)
    const media_type = (
      mimeType.startsWith("image/png") ? "image/png" :
      mimeType.startsWith("image/gif") ? "image/gif" :
      mimeType.startsWith("image/webp") ? "image/webp" :
      "image/jpeg"
    ) as "image/jpeg" | "image/png" | "image/gif" | "image/webp"

    const msg = await anthropic.messages.create({
      model: VISION_MODEL,
      max_tokens: 250,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type, data: buffer.toString("base64") } },
          {
            type: "text",
            text: `This is scene 1 of an animated cartoon. Describe ONLY the appearance details of each character that must stay consistent in later scenes: clothing (color, style, length), hair (length, style, color if dyed), and any visible accessories (jewelry, watches, glasses, headwear).

Rules:
- Do NOT describe the background, setting, lighting, or pose.
- Do NOT describe emotions or facial expressions.
- If there are multiple characters, label them by visible gender (e.g. "Man: ...", "Woman: ...").
- Write as a comma-separated list per character, not full sentences.
- Be concrete — say "knee-length white sundress with thin shoulder straps" not "elegant dress".

Output only the descriptor lines — no preamble, no markdown.`,
          },
        ],
      }],
    })

    const block = msg.content[0]
    if (block.type !== "text") return null
    const text = block.text.trim()
    return text.length > 0 ? text : null
  } catch (e) {
    console.error("[describeFirstFrame] failed:", (e as Error)?.message)
    return null
  }
}
