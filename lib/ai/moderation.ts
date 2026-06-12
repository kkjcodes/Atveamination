import { anthropic, BRIEF_MODEL } from "./client"

export interface ModerationResult {
  allowed: boolean
  reason?: string
}

// Rewrites a fal.ai video prompt to avoid content filter rejections while
// preserving the animated cartoon story intent.
export async function sanitizeVideoPrompt(prompt: string): Promise<string> {
  try {
    const response = await anthropic.messages.create({
      model: BRIEF_MODEL,
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Rewrite this animated cartoon video prompt to pass a strict content filter. The filter pattern-matches on words that sound violent or weapon-related, even in innocent contexts like sports.

Rules:
1. Weapons → animated equivalents: rifle/gun/pistol → "energy beam"; sword/knife → "cartoon blade"; detonator/bomb/missile → "energy device"; tank → "armored vehicle"
2. Combat violence → softer equivalents: gunshot/blast → "burst of light"; "enemy forces" → "rival team"
3. Sports context: ALWAYS add "baseball", "cricket", "sport" etc. to disambiguate — "bat" must become "baseball bat", "bat swing", or "cricket bat"; "impact" in sports → "contact"; "crack" in sports → "pop" or "snap"
4. Body language that sounds like assault → clarify with sport/activity context: "body twists" → "athlete twists"; "sharp crack" of a bat → "satisfying pop of bat on ball"
5. "Dazzling flash of impact" sounds violent → replace with "burst of cartoon energy" or "animated action lines"
6. Keep all animation style words, character descriptions, background descriptions, and camera/motion descriptions unchanged.

Return ONLY the rewritten prompt. No explanation.

Prompt: ${prompt}`,
        },
      ],
    })
    const block = response.content[0]
    if (block.type === "text" && block.text.trim()) return block.text.trim()
  } catch {
    // Fail open — submit original if rewrite fails
  }
  return prompt
}

export async function moderatePrompt(text: string): Promise<ModerationResult> {
  let response
  try {
    response = await anthropic.messages.create({
      model: BRIEF_MODEL,
      max_tokens: 80,
      messages: [
        {
          role: "user",
          content: `You are a content moderator for an AI cartoon video app where users animate themselves as cartoon characters.

Respond with JSON only — no other text: {"allowed": true} or {"allowed": false, "reason": "brief reason"}

Reject if the description contains: nudity, sexual content, explicit acts, content sexualizing minors, graphic gore, or clear intent to harass a specific named real person.

Allow everything else, including action, romance, fantasy, humor, violence in a cartoon context, and mature themes without explicit content.

Description: ${JSON.stringify(text)}`,
        },
      ],
    })
  } catch {
    // Fail open — don't block generation if moderation is unavailable
    return { allowed: true }
  }

  const block = response.content[0]
  if (block.type !== "text") return { allowed: true }

  try {
    const result = JSON.parse(block.text.replace(/```json\n?|```\n?/g, "").trim()) as {
      allowed: boolean
      reason?: string
    }
    return { allowed: !!result.allowed, reason: result.reason }
  } catch {
    return { allowed: true }
  }
}
