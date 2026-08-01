import { describe, it, expect } from "vitest"
import { deriveMood, deriveFamily, deriveSlotSlug, harmonicSafeBpm } from "../../../scripts/music-tagger.mjs"

// The tagger has two backends (Essentia + local heuristics). Both feed the
// same three pure functions below. Tests here pin those functions — the
// backends live behind ffmpeg/Essentia and are tested by running the actual
// curate script on real audio (out-of-band).

describe("deriveMood — audio-feature fallback (real music RMS scale 0.05..0.30)", () => {
  it("upbeat = mid-high energy + bright + fast", () => {
    // Real "upbeat corporate" tracks: energy 0.25-0.30, brightness 0.6+, bpm 120+
    expect(deriveMood(125, 0.28, 0.70)).toBe("upbeat")
  })

  it("upbeat also triggers on BPM >= 115 alone (energy might be modest)", () => {
    // Fast tempo indicates driving music even at modest RMS.
    expect(deriveMood(125, 0.19, 0.70)).toBe("upbeat")
  })

  it("intense = mid-high energy + dark (dark = low brightness)", () => {
    expect(deriveMood(110, 0.28, 0.40)).toBe("intense")
  })

  it("intense also triggers on fast BPM + dark", () => {
    expect(deriveMood(130, 0.20, 0.45)).toBe("intense")
  })

  it("peaceful = low energy + bright + slow", () => {
    expect(deriveMood(75, 0.15, 0.70)).toBe("peaceful")
  })

  it("warm = low energy + dark", () => {
    expect(deriveMood(80, 0.15, 0.40)).toBe("warm")
  })

  it("calm = mid energy + slow with no strong tone", () => {
    // BPM below 115 to avoid the upbeat/intense override.
    expect(deriveMood(90, 0.21, 0.50)).toBe("calm")
  })
})

describe("deriveMood — filename keyword hints (highest confidence)", () => {
  it("holiday from name hint overrides audio features", () => {
    expect(deriveMood(120, 0.7, 0.7, "the_mountain-christmas-background.mp3")).toBe("holiday")
    expect(deriveMood(75, 0.3, 0.7, "santa-jingle.mp3")).toBe("holiday")
    expect(deriveMood(100, 0.5, 0.5, "holiday-cheer.mp3")).toBe("holiday")
    expect(deriveMood(100, 0.5, 0.5, "xmas-swing.mp3")).toBe("holiday")
  })

  it("case-insensitive on holiday keywords", () => {
    expect(deriveMood(100, 0.5, 0.5, "Christmas-Track.mp3")).toBe("holiday")
    expect(deriveMood(100, 0.5, 0.5, "CHRISTMAS.mp3")).toBe("holiday")
  })

  it("upbeat name-hint routes to upbeat even at chill audio features", () => {
    // A track literally called "upbeat corporate" IS upbeat regardless of RMS.
    expect(deriveMood(100, 0.15, 0.60, "kornevmusic-upbeat-happy-corporate.mp3")).toBe("upbeat")
    expect(deriveMood(120, 0.19, 0.70, "ikoliks-upbeat-energetic-background.mp3")).toBe("upbeat")
  })

  it("upbeat name-hint routes to intense when brightness is low", () => {
    // Dark + labeled upbeat = intense (driving but dark).
    expect(deriveMood(100, 0.15, 0.40, "energetic-action-track.mp3")).toBe("intense")
  })

  it("corporate keyword routes to upbeat/intense", () => {
    expect(deriveMood(100, 0.20, 0.70, "prettyjohn-corporate-music.mp3")).toBe("upbeat")
    expect(deriveMood(100, 0.20, 0.30, "corporate-action.mp3")).toBe("intense")
  })

  it("inspire keyword routes to upbeat", () => {
    expect(deriveMood(100, 0.20, 0.70, "cinematic-soul-inspire-motion.mp3")).toBe("upbeat")
  })

  it("gym / workout / promo keywords route to upbeat/intense", () => {
    expect(deriveMood(120, 0.20, 0.70, "gym-workout-track.mp3")).toBe("upbeat")
    expect(deriveMood(120, 0.20, 0.40, "promo-intro.mp3")).toBe("intense")
  })

  it("chill / lofi / ambient name-hint routes to peaceful/calm", () => {
    expect(deriveMood(100, 0.30, 0.70, "luke-bergs-chill.mp3")).toBe("peaceful")
    expect(deriveMood(100, 0.30, 0.40, "ambient-drone.mp3")).toBe("calm")
    expect(deriveMood(100, 0.30, 0.70, "lofi-study.mp3")).toBe("peaceful")
  })

  it("non-keyword filenames fall through to audio-feature logic", () => {
    // "winter" is not in any keyword set — audio features decide.
    expect(deriveMood(120, 0.28, 0.70, "winter-drive.mp3")).toBe("upbeat")
  })
})

describe("deriveFamily", () => {
  it("upbeat mood → bold_promo", () => {
    expect(deriveFamily({ mood: "upbeat", bpm: 120, energy: 0.7 })).toBe("bold_promo")
  })

  it("intense mood → bold_promo", () => {
    expect(deriveFamily({ mood: "intense", bpm: 110, energy: 0.7 })).toBe("bold_promo")
  })

  it("holiday mood → scrapbook (nostalgia family)", () => {
    expect(deriveFamily({ mood: "holiday", bpm: 90, energy: 0.4 })).toBe("scrapbook")
  })

  it("warm mood → scrapbook", () => {
    expect(deriveFamily({ mood: "warm", bpm: 75, energy: 0.35 })).toBe("scrapbook")
  })

  it("calm at high BPM+energy still ends up bold_promo (numeric override)", () => {
    // A "calm" mood label but the numbers suggest driving music.
    expect(deriveFamily({ mood: "calm", bpm: 120, energy: 0.6 })).toBe("bold_promo")
  })

  it("peaceful at very low BPM+energy → scrapbook", () => {
    expect(deriveFamily({ mood: "peaceful", bpm: 70, energy: 0.3 })).toBe("scrapbook")
  })

  it("mid-tempo peaceful → clean_modern (default)", () => {
    expect(deriveFamily({ mood: "peaceful", bpm: 95, energy: 0.45 })).toBe("clean_modern")
  })

  it("calm at moderate BPM → clean_modern", () => {
    expect(deriveFamily({ mood: "calm", bpm: 95, energy: 0.45 })).toBe("clean_modern")
  })
})

describe("harmonicSafeBpm — guards against double-time detection", () => {
  it("passes through plausible BPM (60-160) unchanged", () => {
    expect(harmonicSafeBpm(60)).toBe(60)
    expect(harmonicSafeBpm(100)).toBe(100)
    expect(harmonicSafeBpm(140)).toBe(140)
    expect(harmonicSafeBpm(160)).toBe(160)
    expect(harmonicSafeBpm(150)).toBe(150)  // 150 is still plausible
  })

  it("halves BPM strictly above 160 (music-tempo commonly picks eighth-note pulse)", () => {
    // A 90-BPM ballad often gets detected as 180 BPM (2x). Halve it.
    expect(harmonicSafeBpm(180)).toBe(90)
    expect(harmonicSafeBpm(200)).toBe(100)
    expect(harmonicSafeBpm(161)).toBe(81)  // just over threshold — halved
  })

  it("rounds to nearest integer", () => {
    expect(harmonicSafeBpm(100.4)).toBe(100)
    expect(harmonicSafeBpm(100.6)).toBe(101)
    expect(harmonicSafeBpm(181)).toBe(91)  // 181/2 = 90.5 → 91
  })

  it("returns default 100 for NaN/non-finite input", () => {
    expect(harmonicSafeBpm(NaN)).toBe(100)
    expect(harmonicSafeBpm(Number.POSITIVE_INFINITY)).toBe(100)
  })
})

describe("deriveSlotSlug", () => {
  it("format is {family}_{mood}_{bpm-band}", () => {
    const slug = deriveSlotSlug("clean_modern", { mood: "calm", bpm: 100 }, [])
    expect(slug).toBe("clean_modern_calm_mid")
  })

  it("bpm band: slow < 95 < mid < 120 <= fast", () => {
    expect(deriveSlotSlug("bold_promo", { mood: "upbeat", bpm: 130 }, [])).toBe("bold_promo_upbeat_fast")
    expect(deriveSlotSlug("bold_promo", { mood: "upbeat", bpm: 120 }, [])).toBe("bold_promo_upbeat_fast")
    expect(deriveSlotSlug("bold_promo", { mood: "upbeat", bpm: 100 }, [])).toBe("bold_promo_upbeat_mid")
    expect(deriveSlotSlug("bold_promo", { mood: "upbeat", bpm: 80 }, [])).toBe("bold_promo_upbeat_slow")
  })

  it("collision → suffix _2, _3, etc.", () => {
    const existing = ["clean_modern_calm_mid"]
    expect(deriveSlotSlug("clean_modern", { mood: "calm", bpm: 100 }, existing)).toBe("clean_modern_calm_mid_2")
  })

  it("multiple collisions → next available integer", () => {
    const existing = ["scrapbook_warm_slow", "scrapbook_warm_slow_2", "scrapbook_warm_slow_3"]
    expect(deriveSlotSlug("scrapbook", { mood: "warm", bpm: 75 }, existing)).toBe("scrapbook_warm_slow_4")
  })

  it("collision numbering starts at 2 (not 1) to keep base id clean", () => {
    const existing = ["clean_modern_peaceful_slow"]
    const slug = deriveSlotSlug("clean_modern", { mood: "peaceful", bpm: 80 }, existing)
    expect(slug).not.toContain("_1")
    expect(slug).toBe("clean_modern_peaceful_slow_2")
  })
})
