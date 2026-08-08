// One-click "quick spins" for an existing ad — canned edit requests fed to the
// existing iterate pipeline. Seasonal spins share the occasion date windows.

import { inSeasonalWindow, type SeasonalWindow } from "@/lib/business/occasions"

export type QuickSpin = {
  id: string
  label: string
  editRequest: string
  window?: SeasonalWindow
}

export const QUICK_SPINS: QuickSpin[] = [
  {
    id: "halloween",
    label: "🎃 Halloween version",
    editRequest:
      "Give this ad a tasteful Halloween twist: spooky-fun wording and seasonal references (pumpkins, autumn, trick-or-treat energy) in the on-screen text and narration. Keep every fact, offer, price, and contact detail exactly the same. Fun, never actually scary.",
    window: { from: "09-15", to: "11-01" },
  },
  {
    id: "holidays",
    label: "🎄 Holiday version",
    editRequest:
      "Give this ad a warm year-end holiday feel: festive, generous wording and seasonal references in the on-screen text and narration. Keep every fact, offer, price, and contact detail exactly the same.",
    window: { from: "11-15", to: "12-31" },
  },
  {
    id: "punchier",
    label: "✨ Shorter & punchier",
    editRequest:
      "Make every on-screen line and narration sentence shorter and punchier. Cut filler words. Keep every fact, offer, and contact detail exactly the same.",
  },
  {
    id: "urgent",
    label: "📣 More urgent",
    editRequest:
      "Increase the urgency: stronger call-to-action wording and an act-now feel. Do NOT invent deadlines, discounts, or scarcity that aren't in the current ad. Keep every fact and contact detail exactly the same.",
  },
]

export function spinsForDate(date: Date): QuickSpin[] {
  return QUICK_SPINS.filter((s) => !s.window || inSeasonalWindow(date, s.window))
}
