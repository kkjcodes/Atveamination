import { describe, it, expect } from "vitest"
import {
  detectMultiCharScene,
  hasRelationalCues,
  shouldForceShared,
  inferSpeakerCharacterId,
} from "@/lib/scene-routing"

const CHARS = [
  { id: "kumar-id", name: "Kumar" },
  { id: "kirti-id", name: "Kirti" },
]
const NAMES = CHARS.map((c) => c.name)

describe("detectMultiCharScene", () => {
  it("returns true when 2+ project characters are named", () => {
    expect(detectMultiCharScene("Kumar walks toward Kirti at sunset", NAMES)).toBe(true)
  })
  it("returns false when only one character is named", () => {
    expect(detectMultiCharScene("Kumar walks alone at sunset", NAMES)).toBe(false)
  })
  it("returns false for a single-character project (length < 2)", () => {
    expect(detectMultiCharScene("Kumar and Kirti walk together", ["Kumar"])).toBe(false)
  })
  it("is case-insensitive", () => {
    expect(detectMultiCharScene("KUMAR meets kirti", NAMES)).toBe(true)
  })
  it("requires whole-word matches — substring 'Kumarpur' does not count as Kumar", () => {
    expect(detectMultiCharScene("Kumarpur is a town and Kirti lives there", NAMES)).toBe(false)
  })
})

describe("hasRelationalCues", () => {
  it("triggers on 'they embrace'", () => {
    expect(hasRelationalCues("They embrace on the beach")).toBe(true)
  })
  it("triggers on 'approaching figure'", () => {
    expect(hasRelationalCues("Kumar sees an approaching figure")).toBe(true)
  })
  it("triggers on 'looks at her'", () => {
    expect(hasRelationalCues("He looks at her warmly")).toBe(true)
  })
  it("triggers on 'walks toward him'", () => {
    expect(hasRelationalCues("She walks toward him slowly")).toBe(true)
  })
  it("triggers on 'the couple'", () => {
    expect(hasRelationalCues("The couple holds hands")).toBe(true)
  })
  it("does NOT trigger on solo scenes", () => {
    expect(hasRelationalCues("Kumar sits alone on a bench")).toBe(false)
    expect(hasRelationalCues("She walks down the street")).toBe(false)
    expect(hasRelationalCues("Heather stirs a pot in the kitchen")).toBe(false)
  })
  it("does NOT trigger on 'looks at the sunset' (looking at a thing, not a person)", () => {
    expect(hasRelationalCues("Kumar looks at the sunset")).toBe(false)
  })
})

describe("shouldForceShared", () => {
  it("forces shared when the description names multiple characters", () => {
    expect(shouldForceShared("Kumar proposes to Kirti", NAMES)).toBe(true)
  })
  it("forces shared on relational cues even without explicit names", () => {
    expect(shouldForceShared("They embrace at sunset", NAMES)).toBe(true)
  })
  it("does NOT force shared for a single-character project", () => {
    expect(shouldForceShared("Kumar and Kirti embrace", ["Kumar"])).toBe(false)
  })
  it("does NOT force shared on a solo scene with no relational cues", () => {
    expect(shouldForceShared("Kumar walks down the street alone", NAMES)).toBe(false)
  })
})

describe("inferSpeakerCharacterId", () => {
  it("returns the OTHER character when the line addresses one by name", () => {
    expect(inferSpeakerCharacterId("Kirti, will you marry me?", CHARS)).toBe("kumar-id")
    expect(inferSpeakerCharacterId("Kumar, look at this sunset!", CHARS)).toBe("kirti-id")
  })
  it("matches case-insensitively", () => {
    expect(inferSpeakerCharacterId("KIRTI, you make me happy.", CHARS)).toBe("kumar-id")
  })
  it("returns null when the line doesn't start with a name", () => {
    expect(inferSpeakerCharacterId("Yes! Yes, a thousand times yes!", CHARS)).toBeNull()
    expect(inferSpeakerCharacterId("This is it.", CHARS)).toBeNull()
  })
  it("returns null when the addressed name isn't a project character", () => {
    expect(inferSpeakerCharacterId("Stranger, why are you here?", CHARS)).toBeNull()
  })
  it("returns null for empty or missing scripts", () => {
    expect(inferSpeakerCharacterId(null, CHARS)).toBeNull()
    expect(inferSpeakerCharacterId("", CHARS)).toBeNull()
    expect(inferSpeakerCharacterId(undefined, CHARS)).toBeNull()
  })
  it("returns null for single-character projects (no other character to infer)", () => {
    expect(inferSpeakerCharacterId("Kumar, look here.", [CHARS[0]])).toBeNull()
  })
})
