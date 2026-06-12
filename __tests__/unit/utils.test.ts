import { describe, it, expect } from "vitest"
import { cn } from "@/lib/utils"

describe("cn()", () => {
  it("merges multiple class names into one string", () => {
    expect(cn("foo", "bar")).toBe("foo bar")
  })

  it("handles a single class name", () => {
    expect(cn("foo")).toBe("foo")
  })

  it("handles conditional classes that are truthy", () => {
    expect(cn("foo", true && "bar")).toBe("foo bar")
  })

  it("omits conditional classes that are falsy (false)", () => {
    expect(cn("foo", false && "bar")).toBe("foo")
  })

  it("omits undefined inputs", () => {
    expect(cn("foo", undefined)).toBe("foo")
  })

  it("omits null inputs", () => {
    // clsx accepts ClassValue which includes null
    expect(cn("foo", null as unknown as string)).toBe("foo")
  })

  it("handles an empty argument list", () => {
    expect(cn()).toBe("")
  })

  it("handles array inputs", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar")
  })

  it("handles nested arrays", () => {
    expect(cn(["foo", ["bar", "baz"]])).toBe("foo bar baz")
  })

  it("resolves Tailwind conflict: last background wins (twMerge)", () => {
    // tailwind-merge should keep bg-blue-500, discarding bg-red-500
    expect(cn("bg-red-500", "bg-blue-500")).toBe("bg-blue-500")
  })

  it("resolves Tailwind conflict: last text color wins", () => {
    expect(cn("text-red-500", "text-green-700")).toBe("text-green-700")
  })

  it("non-conflicting Tailwind classes are both preserved", () => {
    const result = cn("text-sm", "font-bold")
    expect(result).toContain("text-sm")
    expect(result).toContain("font-bold")
  })

  it("merges object syntax from clsx", () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe("foo baz")
  })

  it("merges mixed positional and object inputs", () => {
    const result = cn("base", { active: true, disabled: false })
    expect(result).toContain("base")
    expect(result).toContain("active")
    expect(result).not.toContain("disabled")
  })
})
