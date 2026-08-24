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
  // Movable holidays (lunar festivals, Nth-Monday holidays): the exact-date
  // sentence appended to the brief, per year. An unlisted year falls back to
  // the undated brief (which should tell the model to use dates from notes).
  // 2027+ dates land via the yearly refresh (roadmap: monthly date job).
  datedBrief?: Record<number, string>
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
    id: "grand_opening",
    label: "🎊 Grand opening",
    brief: "Grand-opening ad: a brand-new business opening its doors. Big welcome energy; make the location and opening date (from notes, if given) unmissable.",
  },
  {
    id: "new_location",
    label: "📍 We've moved",
    brief: "Moving / new-location ad: tell loyal customers where to find the business now. The new address is the star — repeat it; mention what's better (parking, space, area) only if the notes say so.",
  },
  {
    id: "anniversary",
    label: "🎂 Anniversary",
    brief: "Business-anniversary ad: celebrate the milestone and thank customers. Feature the number of years and any thank-you offer from the notes; never invent discounts.",
  },

  // ── US seasonal ─────────────────────────────────────────────────────────
  {
    id: "valentines",
    label: "💝 Valentine's Day",
    brief: "Valentine's Day special: gifts, treats, and date-worthy picks. Valentine's Day is February 14 — state the date and build urgency to shop before it.",
    window: { from: "01-25", to: "02-14" },
  },
  {
    id: "st_patricks",
    label: "🍀 St. Patrick's Day",
    brief: "St. Patrick's Day special: green, festive, playful. St. Patrick's Day is March 17 — state the date. Keep every fact and offer exactly intact.",
    window: { from: "03-05", to: "03-17" },
  },
  {
    id: "easter",
    label: "🐣 Easter",
    brief: "Easter special: spring, family gatherings, baskets and treats. Build urgency to shop before Easter Sunday.",
    window: { from: "03-10", to: "04-30" },
    datedBrief: { 2026: "This year Easter falls on Sunday, April 5 — state the date." },
  },
  {
    id: "mothers_day",
    label: "💐 Mother's Day",
    brief: "Mother's Day special: gifts and gestures for mom. Build urgency to order or visit before the day.",
    window: { from: "04-20", to: "05-10" },
    datedBrief: { 2026: "This year Mother's Day falls on Sunday, May 10 — state the date." },
  },
  {
    id: "memorial_day",
    label: "🇺🇸 Memorial Day",
    brief: "Memorial Day weekend ad: kickoff-of-summer energy — cookouts, long weekend, seasonal deals. Respectful tone; it's a remembrance holiday, never joke about its meaning.",
    window: { from: "05-11", to: "05-25" },
    datedBrief: { 2026: "This year Memorial Day falls on Monday, May 25 — state the date." },
  },
  {
    id: "fathers_day",
    label: "🛠️ Father's Day",
    brief: "Father's Day special: gifts and treats for dad. Build urgency to order or visit before the day.",
    window: { from: "06-01", to: "06-21" },
    datedBrief: { 2026: "This year Father's Day falls on Sunday, June 21 — state the date." },
  },
  {
    id: "july4",
    label: "🎆 July 4th",
    brief: "Independence Day special: summer, cookouts, fireworks energy. July 4th is the date — state it and feature any holiday-weekend offer from the notes.",
    window: { from: "06-20", to: "07-04" },
  },
  {
    id: "back_to_school",
    label: "🎒 Back to school",
    brief: "Back-to-school season: families restocking for the new school year. Practical, upbeat; feature the products or offers in the notes and photos.",
    window: { from: "07-20", to: "09-05" },
  },
  {
    id: "labor_day",
    label: "⚒️ Labor Day",
    brief: "Labor Day weekend ad: end-of-summer energy, long-weekend deals. Build urgency around the holiday weekend.",
    window: { from: "08-24", to: "09-07" },
    datedBrief: { 2026: "This year Labor Day falls on Monday, September 7 — state the date." },
  },
  {
    id: "halloween",
    label: "🎃 Halloween special",
    brief: "Halloween special: tasteful spooky-fun wording and seasonal references (pumpkins, autumn, trick-or-treat energy). Keep every fact, offer, and contact detail exactly intact. Fun, never actually scary or off-brand. Halloween is October 31.",
    window: { from: "09-15", to: "11-01" },
  },
  {
    id: "thanksgiving",
    label: "🦃 Thanksgiving",
    brief: "Thanksgiving ad: gratitude, gathering, the big meal. Feature holiday staples or pre-order deadlines from the notes; build urgency to stock up before the day.",
    window: { from: "11-01", to: "11-26" },
    datedBrief: { 2026: "This year Thanksgiving falls on Thursday, November 26 — state the date." },
  },
  {
    id: "black_friday",
    label: "🛍️ Black Friday",
    brief: "Black Friday / Small Business Saturday ad: the year's biggest deal moment. Lead with the concrete offer from the notes — never invent discounts. High urgency, clear dates.",
    window: { from: "11-10", to: "11-30" },
    datedBrief: { 2026: "This year Black Friday is November 27 and Small Business Saturday is November 28 — state the dates." },
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

  // ── Indian festivals ────────────────────────────────────────────────────
  {
    id: "pongal_sankranti",
    label: "🪁 Pongal / Sankranti",
    brief: "Pongal and Makar Sankranti special: harvest-festival warmth — fresh produce, sweets, festive cooking. Pongal and Sankranti fall on January 14-15 — state the dates and build urgency to stock up.",
    window: { from: "01-02", to: "01-16" },
  },
  {
    id: "holi",
    label: "🎨 Holi",
    brief: "Holi special: the festival of colors — joy, sweets, gulal, celebration supplies. Build urgency to shop before the festival.",
    window: { from: "02-15", to: "03-05" },
    datedBrief: { 2026: "This year Holi falls on Wednesday, March 4 — state the date." },
  },
  {
    id: "eid_al_fitr",
    label: "🌙 Eid al-Fitr",
    brief: "Eid al-Fitr special: the celebration ending Ramadan — festive foods, sweets, gifts, gatherings. The exact date follows the moon sighting; feature the date from the notes if given, otherwise say 'this Eid'.",
    window: { from: "03-01", to: "03-22" },
  },
  {
    id: "eid_al_adha",
    label: "🌙 Eid al-Adha",
    brief: "Eid al-Adha special: festive foods and family gatherings. The exact date follows the moon sighting; feature the date from the notes if given, otherwise say 'this Eid'.",
    window: { from: "05-14", to: "05-28" },
  },
  {
    id: "rakhi",
    label: "🪢 Rakhi special",
    brief: "Raksha Bandhan (Rakhi) special: celebrate the sibling bond — the rakhi thread, sweets, gifts. Name one concrete offer or product from the notes; never invent discounts. Build urgency to visit before the festival day.",
    window: { from: "07-15", to: "08-31" },
    datedBrief: { 2026: "This year Raksha Bandhan falls on Friday, August 28 — state the date in the ad." },
  },
  {
    id: "onam",
    label: "🌼 Onam",
    brief: "Onam special: Kerala's harvest festival — Onam Sadya ingredients, banana chips, payasam, flowers. Feature the date from the notes if given; build urgency to stock up for the Sadya.",
    window: { from: "08-10", to: "08-31" },
  },
  {
    id: "janmashtami",
    label: "🦚 Janmashtami",
    brief: "Krishna Janmashtami special: pooja items, sweets (especially milk-based), festive supplies. Build urgency to prepare before the celebration night.",
    window: { from: "08-20", to: "09-02" },
    datedBrief: { 2026: "This year Janmashtami falls on Wednesday, September 2 — state the date." },
  },
  {
    id: "ganesh_chaturthi",
    label: "🐘 Ganesh Chaturthi",
    brief: "Ganesh Chaturthi special: pooja essentials, modak and sweets, decoration supplies for welcoming Ganesha home. Build urgency to prepare before the festival begins.",
    window: { from: "08-31", to: "09-14" },
    datedBrief: { 2026: "This year Ganesh Chaturthi falls on Monday, September 14 — state the date." },
  },
  {
    id: "navratri",
    label: "🩰 Navratri",
    brief: "Navratri special: nine nights of devotion and dance — vrat/fasting foods, pooja items, garba energy. State the festival dates and build urgency to stock up before they start.",
    window: { from: "09-20", to: "10-17" },
    datedBrief: { 2026: "This year Navratri runs October 9 to 17 — state the dates." },
  },
  {
    id: "dussehra",
    label: "🏹 Dussehra",
    brief: "Dussehra special: the victory of good over evil — sweets, gifts, celebration supplies. Build urgency to shop before the festival day.",
    window: { from: "10-05", to: "10-20" },
    datedBrief: { 2026: "This year Dussehra falls on Tuesday, October 20 — state the date." },
  },
  {
    id: "diwali",
    label: "🪔 Diwali",
    brief: "Diwali special: the festival of lights — diyas, sweets and mithai boxes, gifts, pooja items, decorations. The biggest shopping festival of the year; lead with the concrete offer from the notes and build strong urgency.",
    window: { from: "10-15", to: "11-08" },
    datedBrief: { 2026: "This year Diwali falls on Sunday, November 8 — state the date." },
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

// Brief text for the prompt, with the concrete date sentence appended when
// we know it for the render year. A dated festival ad must SAY the date —
// a reviewed customer ad never did, and had no urgency at all.
export function occasionBrief(occasion: Occasion | null, date: Date = new Date()): string | null {
  if (!occasion) return null
  const dated = occasion.datedBrief?.[date.getFullYear()]
  if (dated) return `${occasion.brief} ${dated}`
  return occasion.brief || null
}
