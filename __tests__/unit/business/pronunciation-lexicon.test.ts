import { describe, it, expect } from "vitest"
import { applyPronunciationLexicon, lexiconTerms } from "@/lib/business/pronunciation-lexicon"

describe("applyPronunciationLexicon", () => {
  it("wraps a lexicon word in phoneme markup", () => {
    expect(applyPronunciationLexicon("This Rakhi, celebrate."))
      .toBe("This [Rakhi](/ɹˈɑki/), celebrate.")
  })

  it("matches case-insensitively but keeps the writer's casing on display", () => {
    expect(applyPronunciationLexicon("RAKHI time")).toBe("[RAKHI](/ɹˈɑki/) time")
  })

  it("prefers the longest match — multi-word phrases stay whole", () => {
    const out = applyPronunciationLexicon("Happy Raksha Bandhan to all")
    expect(out).toBe("Happy [Raksha Bandhan](/ɹˈɑkʃə bˈʌndən/) to all")
  })

  it("replaces every occurrence in one pass without nesting", () => {
    const out = applyPronunciationLexicon("Rakhi and more Rakhis for Raksha Bandhan")
    expect(out).toBe(
      "[Rakhi](/ɹˈɑki/) and more [Rakhis](/ɹˈɑkiz/) for [Raksha Bandhan](/ɹˈɑkʃə bˈʌndən/)",
    )
    expect(out).not.toContain("[[")
  })

  it("respects word boundaries — no match inside larger words", () => {
    expect(applyPronunciationLexicon("Rakhian traditions")).toBe("Rakhian traditions")
  })

  it("handles adjacent punctuation", () => {
    expect(applyPronunciationLexicon("Try our kulfi!")).toBe("Try our [kulfi](/kˈʊlfi/)!")
  })

  it("leaves text without lexicon words untouched", () => {
    const text = "Fresh bread every morning at six."
    expect(applyPronunciationLexicon(text)).toBe(text)
  })
})

describe("lexiconTerms", () => {
  it("exposes the whitelist for the AdScript prompt", () => {
    const terms = lexiconTerms()
    expect(terms).toContain("Rakhi")
    expect(terms).toContain("Raksha Bandhan")
    expect(terms.length).toBeGreaterThan(0)
  })
})
