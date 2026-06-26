import { describe, it, expect } from "vitest"
import { assignSceneFocus } from "@/lib/storyboard"

describe("assignSceneFocus", () => {
  it("returns empty array when no characters given", () => {
    expect(assignSceneFocus([], 4)).toEqual([])
  })

  it("assigns all scenes to the single character when only one character", () => {
    const result = assignSceneFocus(["char-a"], 5)
    expect(result).toHaveLength(5)
    for (const a of result) {
      expect(a.focusCharacterId).toBe("char-a")
    }
  })

  it("returns correct number of assignments for the given scene count", () => {
    expect(assignSceneFocus(["a", "b"], 6)).toHaveLength(6)
    expect(assignSceneFocus(["a", "b", "c"], 10)).toHaveLength(10)
  })

  it("orderIndex matches position in array", () => {
    const result = assignSceneFocus(["a", "b"], 4)
    result.forEach((a, i) => expect(a.orderIndex).toBe(i))
  })

  it("approximately 75% of scenes are focused (single-char) with 2 characters", () => {
    const result = assignSceneFocus(["a", "b"], 8)
    const sharedCount = result.filter((a) => a.focusCharacterId === null).length
    const focusCount = result.filter((a) => a.focusCharacterId !== null).length
    // ~25% shared, ~75% focused
    expect(sharedCount).toBeGreaterThanOrEqual(1)
    expect(focusCount).toBeGreaterThan(sharedCount)
  })

  it("distributes characters evenly in focus scenes", () => {
    const result = assignSceneFocus(["char-a", "char-b"], 8)
    const focusScenes = result.filter((a) => a.focusCharacterId !== null)
    const aCount = focusScenes.filter((a) => a.focusCharacterId === "char-a").length
    const bCount = focusScenes.filter((a) => a.focusCharacterId === "char-b").length
    // Both characters should appear roughly equally
    expect(Math.abs(aCount - bCount)).toBeLessThanOrEqual(1)
  })

  it("cycles through all characters for focus scenes with 3 characters", () => {
    const result = assignSceneFocus(["a", "b", "c"], 9)
    const focusScenes = result.filter((x) => x.focusCharacterId !== null)
    const aCount = focusScenes.filter((x) => x.focusCharacterId === "a").length
    const bCount = focusScenes.filter((x) => x.focusCharacterId === "b").length
    const cCount = focusScenes.filter((x) => x.focusCharacterId === "c").length
    // Each char gets at least one scene
    expect(aCount).toBeGreaterThan(0)
    expect(bCount).toBeGreaterThan(0)
    expect(cCount).toBeGreaterThan(0)
  })

  it("single character, zero scenes returns empty array", () => {
    expect(assignSceneFocus(["a"], 0)).toHaveLength(0)
  })

  it("all focusCharacterId values are either null or a known characterId", () => {
    const chars = ["char-x", "char-y"]
    const result = assignSceneFocus(chars, 8)
    for (const a of result) {
      expect(a.focusCharacterId === null || chars.includes(a.focusCharacterId)).toBe(true)
    }
  })

  it("never produces more scenes than sceneCount", () => {
    const result = assignSceneFocus(["a", "b", "c", "d"], 12)
    expect(result.length).toBe(12)
  })
})
