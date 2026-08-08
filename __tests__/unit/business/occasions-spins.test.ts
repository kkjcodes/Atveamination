import { describe, it, expect } from "vitest"
import { OCCASIONS, occasionsForDate, occasionById, inSeasonalWindow } from "@/lib/business/occasions"
import { QUICK_SPINS, spinsForDate } from "@/lib/business/spins"

describe("inSeasonalWindow", () => {
  const win = { from: "09-15", to: "11-01" }
  it("inside, edges, outside", () => {
    expect(inSeasonalWindow(new Date(2026, 9, 15), win)).toBe(true)   // Oct 15
    expect(inSeasonalWindow(new Date(2026, 8, 15), win)).toBe(true)   // Sep 15 edge
    expect(inSeasonalWindow(new Date(2026, 10, 1), win)).toBe(true)   // Nov 1 edge
    expect(inSeasonalWindow(new Date(2026, 5, 10), win)).toBe(false)  // Jun 10
  })
  it("supports windows wrapping the year boundary", () => {
    const wrap = { from: "12-20", to: "01-05" }
    expect(inSeasonalWindow(new Date(2026, 11, 25), wrap)).toBe(true)
    expect(inSeasonalWindow(new Date(2026, 0, 3), wrap)).toBe(true)
    expect(inSeasonalWindow(new Date(2026, 5, 1), wrap)).toBe(false)
  })
})

describe("occasionsForDate", () => {
  it("shows Halloween only in its window", () => {
    const oct = occasionsForDate(new Date(2026, 9, 10)).map((o) => o.id)
    const jun = occasionsForDate(new Date(2026, 5, 10)).map((o) => o.id)
    expect(oct).toContain("halloween")
    expect(jun).not.toContain("halloween")
  })
  it("evergreen occasions always present, showcase first", () => {
    const list = occasionsForDate(new Date(2026, 5, 10))
    expect(list[0].id).toBe("showcase")
    for (const id of ["new_listing", "open_house", "sale", "event", "hiring"]) {
      expect(list.map((o) => o.id)).toContain(id)
    }
  })
  it("every occasion except showcase has a non-empty brief", () => {
    for (const o of OCCASIONS) {
      if (o.id === "showcase") continue
      expect(o.brief.length, o.id).toBeGreaterThan(20)
    }
  })
})

describe("occasionById", () => {
  it("finds known ids, rejects unknown", () => {
    expect(occasionById("halloween")?.label).toContain("Halloween")
    expect(occasionById("nonsense")).toBeNull()
    expect(occasionById(null)).toBeNull()
  })
})

describe("spinsForDate", () => {
  it("seasonal spins follow their windows; evergreen always offered", () => {
    const oct = spinsForDate(new Date(2026, 9, 10)).map((s) => s.id)
    const jun = spinsForDate(new Date(2026, 5, 10)).map((s) => s.id)
    expect(oct).toContain("halloween")
    expect(jun).not.toContain("halloween")
    for (const list of [oct, jun]) {
      expect(list).toContain("punchier")
      expect(list).toContain("urgent")
    }
  })
  it("every spin's edit request preserves facts", () => {
    for (const s of QUICK_SPINS) {
      expect(s.editRequest.toLowerCase(), s.id).toContain("exactly the same")
    }
  })
})
