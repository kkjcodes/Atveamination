// Occasion chips for the ad generator. Each occasion injects a creative brief
// line into the AdScript prompt. Seasonal occasions only appear inside their
// date window (month-day based, year-agnostic) so the UI stays current with
// zero code changes per season.

export type SeasonalWindow = { from: string; to: string } // "MM-DD" inclusive

export type Occasion = {
  id: string
  label: string
  brief: string
  window?: SeasonalWindow
}

export const OCCASIONS: Occasion[] = [
  {
    id: "showcase",
    label: "Showcase",
    brief: "", // default — no extra brief, the one-liner carries it
  },
  {
    id: "new_listing",
    label: "New listing",
    brief: "This announces a brand-new listing hitting the market. Lead with novelty and urgency to book a viewing.",
  },
  {
    id: "open_house",
    label: "Open house",
    brief: "This invites people to an open house. Emphasize the invitation and the easy, no-pressure visit. If a date or time appears in the notes, feature it.",
  },
  {
    id: "sale",
    label: "Sale / promo",
    brief: "This promotes a sale or special offer. Lead with the offer and a clear act-now reason. Never invent discounts not present in the notes.",
  },
  {
    id: "event",
    label: "Event",
    brief: "This promotes an upcoming event. Make the date, place, and what-to-expect unmissable. If details appear in the notes, feature them.",
  },
  {
    id: "hiring",
    label: "Hiring",
    brief: "This is a we're-hiring ad. Warm and inviting tone; make the role and how to apply obvious. Speak to candidates, not customers.",
  },
  {
    id: "halloween",
    label: "🎃 Halloween special",
    brief: "Halloween special: tasteful spooky-fun wording and seasonal references (pumpkins, autumn, trick-or-treat energy). Keep every fact, offer, and contact detail exactly intact. Fun, never actually scary or off-brand.",
    window: { from: "09-15", to: "11-01" },
  },
  {
    id: "holidays",
    label: "🎄 Holiday special",
    brief: "Year-end holiday special: warm, festive, generous tone with seasonal references. Keep every fact, offer, and contact detail exactly intact.",
    window: { from: "11-15", to: "12-31" },
  },
  {
    id: "new_year",
    label: "🎉 New year",
    brief: "New-year themed: fresh starts, resolutions, new beginnings. Keep every fact, offer, and contact detail exactly intact.",
    window: { from: "01-01", to: "01-15" },
  },
]

export function inSeasonalWindow(date: Date, window: SeasonalWindow): boolean {
  const mmdd = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
  // Windows never wrap the year boundary in our list; support it anyway.
  if (window.from <= window.to) return mmdd >= window.from && mmdd <= window.to
  return mmdd >= window.from || mmdd <= window.to
}

export function occasionsForDate(date: Date): Occasion[] {
  return OCCASIONS.filter((o) => !o.window || inSeasonalWindow(date, o.window))
}

export function occasionById(id: string | null | undefined): Occasion | null {
  if (!id) return null
  return OCCASIONS.find((o) => o.id === id) ?? null
}
