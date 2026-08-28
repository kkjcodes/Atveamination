// Pronunciation lexicon — Indian festival/food terms that English Kokoro
// voices mispronounce (user-reported: "Rakhi" came out "ra-KH-ee" instead of
// /ˈrɑːkiː/; that alone sank a customer ad).
//
// Mechanism: Kokoro's G2P (misaki) accepts inline phoneme markup in the
// input text — `[Rakhi](/ɹˈɑki/)` speaks the exact phonemes instead of
// guessing from spelling. Verified 2026-08-23 against fal's
// american-english endpoint (marked-up clips matched plain-clip durations;
// the markup is consumed, not read aloud). The hindi/spanish endpoints read
// the markup LITERALLY, so this must only ever be applied to English voices
// (af_/am_/bf_/bm_) — callers gate on that.
//
// Adding a word (the ear-check gate — no entry ships unheard):
//   1. node scripts/audition-pronunciation.mjs "Diwali=dɪwˈɑli" — writes
//      audition clips to ~/Desktop/atve-tts-bench/.
//   2. Listen. Tune the phonemes until it's right.
//   3. Add the entry here with the verified date, and commit.
// The AdScript prompt whitelists these words (lib/business/adscript.ts), so
// a term missing from this file is described in English in the script
// instead of being mispronounced — either we say it right, or not at all.
//
// Candidates for the next audition batch (NOT in the lexicon — the script
// model must describe these in English until they pass the bench).
// FAILED first audition 2026-08-28, phonemes need retuning:
//   Navratri, mehndi, mithai, Ganesh Chaturthi.

// word/phrase (case-insensitive, whole-word) → misaki phoneme string.
// Ear-benched: 2026-08-23 (Konark ad words), 2026-08-28 (festival batch).
export const PRONUNCIATION_LEXICON: Record<string, string> = {
  "Raksha Bandhan": "ɹˈɑkʃə bˈʌndən",
  "Rakhis": "ɹˈɑkiz",
  "Rakhi": "ɹˈɑki",
  "pooja": "pˈudʒɑ",
  "puja": "pˈudʒɑ",
  "kulfi": "kˈʊlfi",
  "Diwali": "dɪwˈɑli",
  "Dussehra": "dəʃˈɛɹə",
  "Holi": "hˈoʊli",
  "Janmashtami": "dʒənmˈɑʃtəmi",
  "Onam": "ˈoʊnəm",
  "Eid": "ˈid",
  "jalebi": "dʒəlˈeɪbi",
  "Sravanamasam": "ʃɹɑvənəmˈɑsəm",
  "Pongal": "pˈoʊŋɡəl",
  "Sankranti": "sənkɹˈɑnti",
}

// The whitelist the AdScript prompt shows the model — single source of truth.
export function lexiconTerms(): string[] {
  return Object.keys(PRONUNCIATION_LEXICON)
}

// Longest-first alternation so "Raksha Bandhan" wins over a bare "Rakhi"-
// style prefix, in ONE pass — sequential per-key replacement could re-match
// display text inside already-inserted markup and nest brackets.
const LEXICON_REGEX = new RegExp(
  `\\b(${Object.keys(PRONUNCIATION_LEXICON)
    .sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|")})\\b`,
  "gi",
)

const PHONEMES_LOWER = new Map(
  Object.entries(PRONUNCIATION_LEXICON).map(([k, v]) => [k.toLowerCase(), v]),
)

// Replace every lexicon word with its phoneme markup. The visible word (with
// the writer's original casing) stays inside the brackets — captions render
// from the untouched vo_text anyway, this is only ever the TTS input.
export function applyPronunciationLexicon(text: string): string {
  return text.replace(LEXICON_REGEX, (match) => {
    const phonemes = PHONEMES_LOWER.get(match.toLowerCase())
    return phonemes ? `[${match}](/${phonemes}/)` : match
  })
}
