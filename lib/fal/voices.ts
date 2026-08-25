// Kokoro voice IDs are prefixed by language + gender: a=American English,
// b=British English, e=Spanish, h=Hindi. `accent` stays for English voices so
// the UI can still surface American/British distinction inside the language tab.
export const PRESET_VOICES = [
  // English (American)
  { id: "af_heart",    label: "Aria",     description: "Warm & friendly",       gender: "female" as const, language: "en" as const, accent: "american" as const },
  { id: "af_bella",    label: "Bella",    description: "Clear & articulate",    gender: "female" as const, language: "en" as const, accent: "american" as const },
  { id: "af_nicole",   label: "Nicole",   description: "Soft & calming",        gender: "female" as const, language: "en" as const, accent: "american" as const },
  { id: "af_sarah",    label: "Sarah",    description: "Upbeat & expressive",   gender: "female" as const, language: "en" as const, accent: "american" as const },
  { id: "af_sky",      label: "Sky",      description: "Youthful & bright",     gender: "female" as const, language: "en" as const, accent: "american" as const },
  { id: "am_adam",     label: "Adam",     description: "Conversational",         gender: "male"   as const, language: "en" as const, accent: "american" as const },
  { id: "am_michael",  label: "Michael",  description: "Deep & authoritative",   gender: "male"   as const, language: "en" as const, accent: "american" as const },
  // English (British)
  { id: "bf_emma",     label: "Emma",     description: "Warm British accent",    gender: "female" as const, language: "en" as const, accent: "british"  as const },
  { id: "bf_isabella", label: "Isabella", description: "Expressive & vivid",     gender: "female" as const, language: "en" as const, accent: "british"  as const },
  { id: "bm_george",   label: "George",   description: "Formal & refined",       gender: "male"   as const, language: "en" as const, accent: "british"  as const },
  { id: "bm_lewis",    label: "Lewis",    description: "Friendly & natural",     gender: "male"   as const, language: "en" as const, accent: "british"  as const },
  // Hindi
  { id: "hf_alpha",    label: "Aanya",    description: "Warm & clear",           gender: "female" as const, language: "hi" as const, accent: "indian"   as const },
  { id: "hf_beta",     label: "Diya",     description: "Bright & expressive",    gender: "female" as const, language: "hi" as const, accent: "indian"   as const },
  { id: "hm_omega",    label: "Arjun",    description: "Deep & grounded",        gender: "male"   as const, language: "hi" as const, accent: "indian"   as const },
  { id: "hm_psi",      label: "Vikram",   description: "Conversational",         gender: "male"   as const, language: "hi" as const, accent: "indian"   as const },
  // Spanish
  { id: "ef_dora",     label: "Dora",     description: "Warm & friendly",        gender: "female" as const, language: "es" as const, accent: "spanish"  as const },
  { id: "em_alex",     label: "Alex",     description: "Conversational",          gender: "male"   as const, language: "es" as const, accent: "spanish"  as const },
  { id: "em_santa",    label: "Mateo",    description: "Deep & authoritative",    gender: "male"   as const, language: "es" as const, accent: "spanish"  as const },
] as const

export type PresetVoiceId = typeof PRESET_VOICES[number]["id"]
export type VoiceLanguage = typeof PRESET_VOICES[number]["language"]

export const SUPPORTED_LANGUAGES = [
  { code: "en" as const, label: "English" },
  { code: "hi" as const, label: "Hindi" },
  { code: "es" as const, label: "Spanish" },
] as const

export function languageForVoice(voiceId: string | null | undefined): VoiceLanguage {
  if (!voiceId) return "en"
  const match = PRESET_VOICES.find((v) => v.id === voiceId)
  return match?.language ?? "en"
}

// Kokoro's default speaking rate is ~2.5 words/sec for English (2.2 for Hindi/
// Spanish). If a voice_script is wordier than the scene's target duration can
// hold, speed it up to fit. Cap at 1.15× — beyond that starts sounding rushed.
export function kokoroSpeedForBudget(
  text: string,
  targetSeconds: number,
  language: string = "en",
): number {
  const wordsPerSecond = language === "en" ? 2.5 : 2.2
  const words = text.trim().split(/\s+/).filter(Boolean).length
  if (words === 0 || targetSeconds <= 0) return 1.0
  const naturalSeconds = words / wordsPerSecond
  const ratio = naturalSeconds / targetSeconds
  if (ratio <= 1.0) return 1.0
  return Math.min(1.15, ratio)
}
