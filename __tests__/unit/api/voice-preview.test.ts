import { describe, it, expect } from "vitest"

// Pure logic extracted from the voice preview API route.
// This map lives in the route handler; we replicate it here to test the logic
// without importing Supabase or Replicate (which require env vars and network).
const VOICE_MAP: Record<string, string> = {
  cheerful: "af_heart",
  dramatic: "am_michael",
  spooky: "bf_emma",
  funny: "af_sky",
}

describe("VOICE_MAP", () => {
  it("has exactly 4 voice style entries", () => {
    expect(Object.keys(VOICE_MAP)).toHaveLength(4)
  })

  it("maps cheerful to a non-empty voice ID", () => {
    expect(VOICE_MAP.cheerful).toBeTruthy()
    expect(typeof VOICE_MAP.cheerful).toBe("string")
  })

  it("maps dramatic to a non-empty voice ID", () => {
    expect(VOICE_MAP.dramatic).toBeTruthy()
    expect(typeof VOICE_MAP.dramatic).toBe("string")
  })

  it("maps spooky to a non-empty voice ID", () => {
    expect(VOICE_MAP.spooky).toBeTruthy()
    expect(typeof VOICE_MAP.spooky).toBe("string")
  })

  it("maps funny to a non-empty voice ID", () => {
    expect(VOICE_MAP.funny).toBeTruthy()
    expect(typeof VOICE_MAP.funny).toBe("string")
  })

  it("all 4 styles map to non-empty strings", () => {
    for (const [, voiceId] of Object.entries(VOICE_MAP)) {
      expect(voiceId).toBeTruthy()
      expect(typeof voiceId).toBe("string")
      expect(voiceId.length).toBeGreaterThan(0)
    }
  })

  it("unknown style is not present in the map", () => {
    expect(VOICE_MAP).not.toHaveProperty("unknown")
    expect(VOICE_MAP).not.toHaveProperty("robot")
    expect(VOICE_MAP).not.toHaveProperty("sad")
  })

  it("all voice IDs are unique (no two styles share a voice)", () => {
    const values = Object.values(VOICE_MAP)
    const uniqueValues = new Set(values)
    expect(uniqueValues.size).toBe(values.length)
  })

  it("maps cheerful to af_heart", () => {
    expect(VOICE_MAP.cheerful).toBe("af_heart")
  })

  it("maps dramatic to am_michael", () => {
    expect(VOICE_MAP.dramatic).toBe("am_michael")
  })

  it("maps spooky to bf_emma", () => {
    expect(VOICE_MAP.spooky).toBe("bf_emma")
  })

  it("maps funny to af_sky", () => {
    expect(VOICE_MAP.funny).toBe("af_sky")
  })
})

// Simulate the lookup logic that the API route would perform
describe("voice lookup logic", () => {
  function lookupVoice(style: string): string | undefined {
    return VOICE_MAP[style]
  }

  it("returns a voice ID for a known style", () => {
    expect(lookupVoice("cheerful")).toBe("af_heart")
    expect(lookupVoice("dramatic")).toBe("am_michael")
    expect(lookupVoice("spooky")).toBe("bf_emma")
    expect(lookupVoice("funny")).toBe("af_sky")
  })

  it("returns undefined for an unknown style", () => {
    expect(lookupVoice("robot")).toBeUndefined()
    expect(lookupVoice("")).toBeUndefined()
    expect(lookupVoice("CHEERFUL")).toBeUndefined() // case-sensitive
  })
})
