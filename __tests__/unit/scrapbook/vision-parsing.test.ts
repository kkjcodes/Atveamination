import { describe, it, expect } from "vitest"
import { parseVisionJson } from "@/lib/scrapbook/vision-parse"
import { parseShotPlan } from "@/lib/scrapbook/models"

describe("parseVisionJson", () => {
  it("parses a bare JSON object", () => {
    const raw = '{"a":1,"b":"x"}'
    expect(parseVisionJson(raw)).toEqual({ a: 1, b: "x" })
  })

  it("strips ```json fences", () => {
    const raw = "```json\n{\"a\":1}\n```"
    expect(parseVisionJson(raw)).toEqual({ a: 1 })
  })

  it("strips ``` fences without json tag", () => {
    const raw = "```\n{\"a\":1}\n```"
    expect(parseVisionJson(raw)).toEqual({ a: 1 })
  })

  it("finds JSON with prose around it", () => {
    const raw = "Sure, here's the plan: {\"a\":1} — hope that helps!"
    expect(parseVisionJson(raw)).toEqual({ a: 1 })
  })

  it("throws when there's no object", () => {
    expect(() => parseVisionJson("nothing here")).toThrow(/No JSON object/)
  })
})

describe("parseShotPlan", () => {
  const VALID = {
    subjects: "a girl (~6) and her father",
    action: "playing catch with a red ball in a backyard",
    setting: "sunny backyard, wooden fence, afternoon light",
    before_frame_prompt: "watercolor scene of the girl mid-throw",
    after_frame_prompt: "watercolor scene, same angle, ball mid-air",
    motion_prompt: "the girl throws the ball in a gentle arc toward her father",
    caption: "First catch of summer!",
    motion_class: "dynamic",
  }

  it("parses a fully-specified plan", () => {
    const plan = parseShotPlan(VALID)
    expect(plan.motion_class).toBe("dynamic")
    expect(plan.caption).toBe("First catch of summer!")
  })

  it("normalizes motion_class casing", () => {
    const plan = parseShotPlan({ ...VALID, motion_class: "DYNAMIC" })
    expect(plan.motion_class).toBe("dynamic")
  })

  it("defaults unknown motion_class to subtle", () => {
    const plan = parseShotPlan({ ...VALID, motion_class: "chaos" })
    expect(plan.motion_class).toBe("subtle")
  })

  it("throws on missing required fields", () => {
    const partial: Record<string, string> = { ...VALID }
    delete partial.caption
    expect(() => parseShotPlan(partial)).toThrow(/missing fields.*caption/i)
  })

  it("throws on empty required strings", () => {
    expect(() => parseShotPlan({ ...VALID, action: "  " })).toThrow(/missing fields.*action/i)
  })

  it("throws on non-object input", () => {
    expect(() => parseShotPlan(null)).toThrow(/not an object/)
    expect(() => parseShotPlan("string")).toThrow(/not an object/)
  })

  it("trims whitespace from all string fields", () => {
    const plan = parseShotPlan({ ...VALID, subjects: "  a girl  " })
    expect(plan.subjects).toBe("a girl")
  })
})
