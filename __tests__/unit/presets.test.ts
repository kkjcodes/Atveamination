import { describe, it, expect } from "vitest"
import {
  PRESET_SCENES,
  getPresetById,
  getPresetsByTag,
  getPresetsByFocusRole,
} from "@/lib/presets/scenes"

describe("PRESET_SCENES", () => {
  it("has exactly 20 scenes", () => {
    expect(PRESET_SCENES).toHaveLength(20)
  })

  it("every scene has a non-empty id", () => {
    for (const s of PRESET_SCENES) {
      expect(typeof s.id).toBe("string")
      expect(s.id.length).toBeGreaterThan(0)
    }
  })

  it("every scene has a non-empty title", () => {
    for (const s of PRESET_SCENES) {
      expect(s.title.length).toBeGreaterThan(0)
    }
  })

  it("every scene has a non-empty description longer than 20 chars", () => {
    for (const s of PRESET_SCENES) {
      expect(s.description.length).toBeGreaterThan(20)
    }
  })

  it("every scene has a non-empty voiceScript", () => {
    for (const s of PRESET_SCENES) {
      expect(s.voiceScript.length).toBeGreaterThan(5)
    }
  })

  it("every scene durationSeconds is 5, 10, or 15", () => {
    for (const s of PRESET_SCENES) {
      expect([5, 10, 15]).toContain(s.durationSeconds)
    }
  })

  it("every scene has at least one tag", () => {
    for (const s of PRESET_SCENES) {
      expect(s.tags.length).toBeGreaterThan(0)
    }
  })

  it("every scene has a valid focusRole", () => {
    const validRoles = ["primary", "secondary", "shared", "any"]
    for (const s of PRESET_SCENES) {
      expect(validRoles).toContain(s.focusRole)
    }
  })

  it("all scene IDs are unique", () => {
    const ids = PRESET_SCENES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("has at least 4 shared-focus scenes for multi-character use", () => {
    const shared = PRESET_SCENES.filter((s) => s.focusRole === "shared")
    expect(shared.length).toBeGreaterThanOrEqual(4)
  })

  it("has at least 8 primary-focus scenes for single-character use", () => {
    const primary = PRESET_SCENES.filter((s) => s.focusRole === "primary")
    expect(primary.length).toBeGreaterThanOrEqual(8)
  })
})

describe("getPresetById", () => {
  it("returns the scene with the given id", () => {
    const scene = getPresetById("morning-coffee")
    expect(scene).toBeDefined()
    expect(scene?.id).toBe("morning-coffee")
  })

  it("returns undefined for an unknown id", () => {
    expect(getPresetById("does-not-exist")).toBeUndefined()
  })
})

describe("getPresetsByTag", () => {
  it("returns scenes matching the given tag", () => {
    const scenes = getPresetsByTag("adventure")
    expect(scenes.length).toBeGreaterThan(0)
    for (const s of scenes) {
      expect(s.tags).toContain("adventure")
    }
  })

  it("returns empty array for an unknown tag", () => {
    expect(getPresetsByTag("definitely-not-a-real-tag-xyz")).toHaveLength(0)
  })
})

describe("getPresetsByFocusRole", () => {
  it("returns scenes with the requested focus role or 'any'", () => {
    const scenes = getPresetsByFocusRole("primary")
    expect(scenes.length).toBeGreaterThan(0)
    for (const s of scenes) {
      expect(["primary", "any"]).toContain(s.focusRole)
    }
  })

  it("includes 'any' scenes when querying shared", () => {
    const any = PRESET_SCENES.filter((s) => s.focusRole === "any")
    if (any.length > 0) {
      const sharedResults = getPresetsByFocusRole("shared")
      expect(sharedResults.some((s) => s.focusRole === "any")).toBe(true)
    }
  })
})
