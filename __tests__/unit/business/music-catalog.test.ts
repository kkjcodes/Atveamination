import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { promises as fsp } from "fs"
import {
  MUSIC_CATALOG,
  getMusicCatalog,
  musicForFamily,
  trackById,
  resolveMusicSource,
  _resetMusicCatalogCache,
} from "@/lib/business/music-catalog"

// spyOn the actual fs.promises.readFile — vi.mock("fs") doesn't reach into
// the module-under-test's captured `promises` binding under our ESM config.
let readFileSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  _resetMusicCatalogCache()
  readFileSpy = vi.spyOn(fsp, "readFile")
})

afterEach(() => {
  readFileSpy.mockRestore()
})

// ── Seed catalog (fallback when no manifest) ────────────────────────────────

describe("SEED_CATALOG (fallback when manifest missing)", () => {
  it("has one placeholder per family — AdScript generation never breaks in dev", () => {
    const families = new Set(MUSIC_CATALOG.map((t) => t.family))
    expect(families.has("clean_modern")).toBe(true)
    expect(families.has("bold_promo")).toBe(true)
    expect(families.has("scrapbook")).toBe(true)
  })

  it("uses the {family}_default id convention", () => {
    for (const t of MUSIC_CATALOG) {
      expect(t.id).toMatch(/_default$/)
    }
  })
})

// ── Dynamic catalog (manifest-driven) ───────────────────────────────────────

describe("getMusicCatalog — driven by manifest.json", () => {
  it("falls back to seed when manifest file is missing", async () => {
    readFileSpy.mockRejectedValueOnce(new Error("ENOENT"))
    const catalog = await getMusicCatalog()
    expect(catalog).toBe(MUSIC_CATALOG)
  })

  it("falls back to seed when manifest is empty {}", async () => {
    readFileSpy.mockResolvedValueOnce("{}")
    const catalog = await getMusicCatalog()
    expect(catalog).toBe(MUSIC_CATALOG)
  })

  it("returns manifest tracks when present", async () => {
    readFileSpy.mockResolvedValueOnce(JSON.stringify({
      "clean_modern_calm_slow": {
        family: "clean_modern",
        path: "/business/music/clean_modern/calm_slow.mp3",
        url: "https://blob.example.com/calm_slow.mp3",
        tags: { bpm: 78, energy: 0.32, brightness: 0.6, dynamics: 0.15, mood: "calm", source: "local" },
      },
    }))
    const catalog = await getMusicCatalog()
    expect(catalog.length).toBe(1)
    expect(catalog[0].id).toBe("clean_modern_calm_slow")
    expect(catalog[0].tags?.bpm).toBe(78)
    expect(catalog[0].url).toContain("blob.example.com")
  })

  it("caches result — subsequent calls don't re-read the file", async () => {
    readFileSpy.mockResolvedValueOnce(JSON.stringify({
      "bold_promo_upbeat_fast": {
        family: "bold_promo",
        path: "/business/music/bold_promo/upbeat_fast.mp3",
        tags: { bpm: 128, energy: 0.7, brightness: 0.8, dynamics: 0.3, mood: "upbeat", source: "local" },
      },
    }))
    await getMusicCatalog()
    await getMusicCatalog()
    await getMusicCatalog()
    expect(readFileSpy).toHaveBeenCalledTimes(1)
  })

  it("survives a corrupt manifest (falls back to seed)", async () => {
    readFileSpy.mockResolvedValueOnce("{ not valid json ]]")
    const catalog = await getMusicCatalog()
    expect(catalog).toBe(MUSIC_CATALOG)
  })

  it("label includes tags when available", async () => {
    readFileSpy.mockResolvedValueOnce(JSON.stringify({
      "scrapbook_warm_slow": {
        family: "scrapbook",
        path: "/business/music/scrapbook/warm_slow.mp3",
        tags: { bpm: 72, energy: 0.3, brightness: 0.45, dynamics: 0.1, mood: "warm", source: "local" },
      },
    }))
    const catalog = await getMusicCatalog()
    expect(catalog[0].label).toContain("bpm 72")
    expect(catalog[0].label).toContain("warm")
  })
})

describe("musicForFamily", () => {
  it("returns only tracks for the requested family", async () => {
    readFileSpy.mockRejectedValueOnce(new Error("ENOENT"))
    const tracks = await musicForFamily("scrapbook")
    for (const t of tracks) expect(t.family).toBe("scrapbook")
  })

  it("returns empty array for unknown family (no crash)", async () => {
    readFileSpy.mockRejectedValueOnce(new Error("ENOENT"))
    expect(await musicForFamily("nonexistent")).toEqual([])
  })
})

describe("trackById", () => {
  it("finds a seed track by id", async () => {
    readFileSpy.mockRejectedValueOnce(new Error("ENOENT"))
    const t = await trackById("clean_modern_default")
    expect(t).not.toBeNull()
    expect(t?.family).toBe("clean_modern")
  })

  it("returns null for unknown id", async () => {
    readFileSpy.mockRejectedValueOnce(new Error("ENOENT"))
    expect(await trackById("bogus_track_id")).toBeNull()
  })

  it("finds a manifest track by id", async () => {
    readFileSpy.mockResolvedValueOnce(JSON.stringify({
      "bold_promo_intense_fast": {
        family: "bold_promo",
        path: "/business/music/bold_promo/intense_fast.mp3",
        tags: { bpm: 140, energy: 0.8, brightness: 0.3, dynamics: 0.4, mood: "intense", source: "local" },
      },
    }))
    const t = await trackById("bold_promo_intense_fast")
    expect(t?.tags?.mood).toBe("intense")
  })
})

describe("resolveMusicSource — blob URL preferred over local", () => {
  it("returns the blob URL from manifest when present", async () => {
    readFileSpy.mockResolvedValueOnce(JSON.stringify({
      "scrapbook_polaroid": {
        family: "scrapbook",
        path: "/business/music/scrapbook/polaroid.mp3",
        url: "https://blob.example.com/scrapbook/polaroid.mp3",
      },
    }))
    expect(await resolveMusicSource("scrapbook_polaroid")).toBe("https://blob.example.com/scrapbook/polaroid.mp3")
  })

  it("falls back to /public when manifest entry has no url (dev without blob)", async () => {
    readFileSpy.mockResolvedValueOnce(JSON.stringify({
      "clean_modern_calm": {
        family: "clean_modern",
        path: "/business/music/clean_modern/calm.mp3",
      },
    }))
    const src = await resolveMusicSource("clean_modern_calm")
    expect(src?.startsWith("http")).toBe(false)
    expect(src).toContain("/public/business/music/clean_modern/calm.mp3")
  })

  it("returns null for unknown track_id", async () => {
    readFileSpy.mockResolvedValueOnce("{}")
    expect(await resolveMusicSource("nonexistent")).toBeNull()
  })

  it("falls back to /public path when manifest is missing entirely", async () => {
    readFileSpy.mockRejectedValueOnce(new Error("ENOENT"))
    const src = await resolveMusicSource("clean_modern_default")
    expect(src?.startsWith("http")).toBe(false)
    expect(src).toContain("clean_modern/default.mp3")
  })
})
