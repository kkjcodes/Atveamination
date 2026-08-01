import { describe, it, expect } from "vitest"
import {
  sha256Prefix,
  blobPathFromLocal,
  familySlugFromBlobPath,
  findManifestEntryForBlobPath,
  needsUpload,
} from "../../../scripts/sync-music-to-blob.mjs"

// Pure-function tests for the deploy-time sync. The full sync() flow depends
// on Azure Blob + filesystem — those live in the integration test suite
// (out-of-band). Here we pin the diff logic that decides what to upload.

describe("sha256Prefix", () => {
  it("returns 16-char default hex prefix", () => {
    const p = sha256Prefix(Buffer.from("hello world"))
    expect(p).toHaveLength(16)
    expect(p).toMatch(/^[a-f0-9]{16}$/)
  })

  it("is deterministic", () => {
    const a = sha256Prefix(Buffer.from("stable input"))
    const b = sha256Prefix(Buffer.from("stable input"))
    expect(a).toBe(b)
  })

  it("differs on different input", () => {
    const a = sha256Prefix(Buffer.from("a"))
    const b = sha256Prefix(Buffer.from("b"))
    expect(a).not.toBe(b)
  })

  it("accepts custom length", () => {
    expect(sha256Prefix(Buffer.from("x"), 8)).toHaveLength(8)
    expect(sha256Prefix(Buffer.from("x"), 32)).toHaveLength(32)
  })
})

describe("blobPathFromLocal", () => {
  it("strips project prefix + /public/ to get the blob path", () => {
    const local = "/proj/public/business/music/clean_modern/peaceful_mid.mp3"
    expect(blobPathFromLocal(local, "/proj")).toBe("business/music/clean_modern/peaceful_mid.mp3")
  })

  it("handles paths without /public/ (returns as-is minus project prefix)", () => {
    const local = "/proj/music/raw.mp3"
    expect(blobPathFromLocal(local, "/proj")).toBe("music/raw.mp3")
  })

  it("preserves nested family folders", () => {
    const local = "/x/y/public/business/music/bold_promo/upbeat_fast.mp3"
    expect(blobPathFromLocal(local, "/x/y")).toBe("business/music/bold_promo/upbeat_fast.mp3")
  })
})

describe("familySlugFromBlobPath", () => {
  it("extracts family + slug from a well-formed path", () => {
    expect(familySlugFromBlobPath("business/music/clean_modern/peaceful_mid.mp3"))
      .toEqual({ family: "clean_modern", slug: "peaceful_mid" })
  })

  it("handles multi-word slugs (families with underscores + slugs with underscores)", () => {
    expect(familySlugFromBlobPath("business/music/bold_promo/upbeat_fast_2.mp3"))
      .toEqual({ family: "bold_promo", slug: "upbeat_fast_2" })
  })

  it("returns null for path that doesn't match the expected shape", () => {
    expect(familySlugFromBlobPath("wrong/prefix/x/y.mp3")).toBeNull()
    expect(familySlugFromBlobPath("business/music/clean_modern/nested/deeper/y.mp3")).toBeNull()
    expect(familySlugFromBlobPath("business/music/family.mp3")).toBeNull()
  })

  it("case-insensitive on .mp3 extension", () => {
    expect(familySlugFromBlobPath("business/music/scrapbook/warm.MP3"))
      .toEqual({ family: "scrapbook", slug: "warm" })
  })
})

describe("findManifestEntryForBlobPath", () => {
  const manifest = {
    "clean_modern_peaceful_mid": {
      family: "clean_modern",
      path: "/business/music/clean_modern/peaceful_mid.mp3",
      url: "https://blob.example.com/x.mp3",
      sha256_prefix: "abcd1234abcd1234",
    },
    "scrapbook_warm_slow": {
      family: "scrapbook",
      path: "/business/music/scrapbook/warm_slow.mp3",
    },
  }

  it("finds matching entry by path suffix", () => {
    const result = findManifestEntryForBlobPath(manifest, "business/music/clean_modern/peaceful_mid.mp3")
    expect(result?.id).toBe("clean_modern_peaceful_mid")
  })

  it("returns null when no entry matches", () => {
    expect(findManifestEntryForBlobPath(manifest, "business/music/nonexistent/x.mp3")).toBeNull()
  })

  it("returns entry with .path (not id) as match key", () => {
    const result = findManifestEntryForBlobPath(manifest, "business/music/scrapbook/warm_slow.mp3")
    expect(result?.entry.family).toBe("scrapbook")
  })
})

describe("needsUpload — the deploy-time diff decision", () => {
  const baseManifest = {
    "clean_modern_peaceful_mid": {
      family: "clean_modern",
      path: "/business/music/clean_modern/peaceful_mid.mp3",
      url: "https://blob.example.com/existing.mp3",
      sha256_prefix: "abcd1234abcd1234",
    },
  }

  it("skips when SHA matches and URL present (idempotent — no upload)", () => {
    const decision = needsUpload(baseManifest, "business/music/clean_modern/peaceful_mid.mp3", "abcd1234abcd1234")
    expect(decision.upload).toBe(false)
    expect(decision.id).toBe("clean_modern_peaceful_mid")
  })

  it("uploads when SHA differs (drift — file was re-curated)", () => {
    const decision = needsUpload(baseManifest, "business/music/clean_modern/peaceful_mid.mp3", "0000newshaXX0000")
    expect(decision.upload).toBe(true)
    expect(decision.reason).toBe("sha-drift")
    expect(decision.id).toBe("clean_modern_peaceful_mid")
  })

  it("uploads when URL missing (first-time upload)", () => {
    const noUrl = { ...baseManifest, "scrapbook_warm": { family: "scrapbook", path: "/business/music/scrapbook/warm.mp3" } }
    const decision = needsUpload(noUrl, "business/music/scrapbook/warm.mp3", "anySha")
    expect(decision.upload).toBe(true)
    expect(decision.reason).toBe("no-url")
    expect(decision.id).toBe("scrapbook_warm")
  })

  it("uploads unregistered files (best-effort — but marks reason)", () => {
    const decision = needsUpload(baseManifest, "business/music/bold_promo/mystery.mp3", "anySha")
    expect(decision.upload).toBe(true)
    expect(decision.reason).toBe("unregistered")
    expect(decision.id).toBeUndefined()
  })

  it("skips when SHA matches even if manifest entry has no explicit sha256_prefix", () => {
    // Legacy entries that predate SHA tracking — if the URL is present, skip.
    const legacy = {
      "legacy_track": {
        family: "clean_modern",
        path: "/business/music/clean_modern/legacy.mp3",
        url: "https://blob.example.com/legacy.mp3",
        // no sha256_prefix
      },
    }
    const decision = needsUpload(legacy, "business/music/clean_modern/legacy.mp3", "computedSha")
    expect(decision.upload).toBe(false)
  })

  it("uploads legacy-no-sha entry when URL is missing (safety)", () => {
    const legacy = {
      "half_migrated": {
        family: "clean_modern",
        path: "/business/music/clean_modern/half.mp3",
      },
    }
    const decision = needsUpload(legacy, "business/music/clean_modern/half.mp3", "anySha")
    expect(decision.upload).toBe(true)
    expect(decision.reason).toBe("no-url")
  })
})
