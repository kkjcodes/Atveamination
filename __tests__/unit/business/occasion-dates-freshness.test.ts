import { describe, it, expect } from "vitest"
import { OCCASIONS } from "@/lib/business/occasions"

// P4 mechanism: movable holidays carry per-year dated briefs that must be
// refreshed before the year rolls over. This test starts failing on Dec 1 if
// next year's dates haven't been added — a build-time reminder that can't be
// ignored, instead of a calendar note that can.
//
// To fix a failure: verify next year's dates (drikpanchang.com for Indian
// festivals; US holidays are rule-based) and add `datedBrief[nextYear]`
// entries. Also re-check the Eid occasion WINDOWS (they shift ~11 days/yr).
describe("occasion date freshness (P4)", () => {
  const now = new Date()
  const isRefreshWindow = now.getUTCMonth() === 11 // December

  it("every movable occasion has a dated brief for the current year", () => {
    const year = now.getUTCFullYear()
    for (const o of OCCASIONS) {
      if (!o.datedBrief) continue
      expect(o.datedBrief[year], `${o.id} is missing its ${year} date`).toBeTruthy()
    }
  })

  it.runIf(isRefreshWindow)(
    "December: next year's dates must be in place before the calendar rolls over",
    () => {
      const nextYear = now.getUTCFullYear() + 1
      const missing = OCCASIONS.filter((o) => o.datedBrief && !o.datedBrief[nextYear]).map((o) => o.id)
      expect(missing, `Add ${nextYear} dates for: ${missing.join(", ")} (see this file's header)`).toEqual([])
    },
  )
})
