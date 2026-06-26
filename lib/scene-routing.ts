// Defensive scene-save logic that applies regardless of caller (UI, scripts,
// direct API). Keeps the visual-routing rules in one place so the frontend
// helpers in app/studio/new/page.tsx and this backend logic can't drift.

// Returns true if the description names 2+ of the project's character names.
export function detectMultiCharScene(description: string, charNames: string[]): boolean {
  if (charNames.length < 2) return false
  const text = description.toLowerCase()
  let matches = 0
  for (const name of charNames) {
    const escaped = name.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    if (new RegExp(`\\b${escaped}\\b`).test(text)) {
      matches++
      if (matches >= 2) return true
    }
  }
  return false
}

// Detects descriptions that imply a second person without naming them — "they
// embrace", "approaching figure", "the couple". These need shared/Multi-Kontext
// routing too, otherwise LoRA duplicates one trained character.
export function hasRelationalCues(description: string): boolean {
  const text = description.toLowerCase()
  return [
    /\b(they|them|their|both|each other|one another)\b/,
    /\b(together|couple|pair|duo)\b/,
    /\b(embraces?|embraced|hugs?|hugged|kiss(?:es|ed)?|holds? hands?|hand[- ]in[- ]hand)\b/,
    /\banother (person|figure|character|man|woman|boy|girl)\b/,
    /\bapproaching (figure|person|man|woman|boy|girl)\b/,
    /\breaches? (toward|out to|for) (her|him|them)\b/,
    /\b(looks?|gazes?|stares?) at (her|him|them)\b/,
    /\b(walks?|runs?|moves?|steps?) (toward|to) (her|him|them)\b/,
  ].some((p) => p.test(text))
}

// Returns true if a scene should be routed as shared (focus=null → Multi-Kontext).
// Either: project has 2+ characters AND (description names 2+ characters OR has
// relational cues implying multiple subjects).
export function shouldForceShared(description: string, charNames: string[]): boolean {
  if (charNames.length < 2) return false
  return detectMultiCharScene(description, charNames) || hasRelationalCues(description)
}

// Infer the speaker from a voiceScript line when the caller didn't tell us.
// Heuristic: if the line addresses a character by name ("Heather, will you..."),
// the speaker is the OTHER character. Used as a server-side fallback for the
// scene-save endpoint and the runtime voice resolution.
export function inferSpeakerCharacterId(
  voiceScript: string | null | undefined,
  projectChars: Array<{ id: string; name: string }>
): string | null {
  if (!voiceScript || projectChars.length < 2) return null
  const match = voiceScript.trim().match(/^([A-Za-z]+)\s*[,!?:]/)
  if (!match) return null
  const addressedName = match[1].toLowerCase()
  const addressed = projectChars.find((c) => c.name.toLowerCase() === addressedName)
  if (!addressed) return null
  const other = projectChars.find((c) => c.id !== addressed.id)
  return other?.id ?? null
}
