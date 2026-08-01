import { describe, it, expect } from "vitest"
import { looksLikeUrl } from "../../../scripts/curate-music.mjs"

// Guards the URL-vs-local-file dispatch inside scripts/curate-music.mjs.
// Wrong classification → the wrong branch runs (fetch on a local file, or
// fs.access on a URL). Both fail with unhelpful errors, hence the test.

describe("curate-music: looksLikeUrl", () => {
  it("treats http:// as URL", () => {
    expect(looksLikeUrl("http://example.com/a.mp3")).toBe(true)
  })

  it("treats https:// as URL", () => {
    expect(looksLikeUrl("https://cdn.pixabay.com/download/audio/x.mp3")).toBe(true)
  })

  it("is case-insensitive on scheme", () => {
    expect(looksLikeUrl("HTTPS://example.com/a.mp3")).toBe(true)
    expect(looksLikeUrl("Http://example.com/a.mp3")).toBe(true)
  })

  it("tolerates leading whitespace (paste-from-terminal artifact)", () => {
    expect(looksLikeUrl("  https://example.com/a.mp3")).toBe(true)
  })

  it("treats absolute file paths as NOT a URL", () => {
    expect(looksLikeUrl("/Users/kumar/Downloads/upright.mp3")).toBe(false)
    expect(looksLikeUrl("/tmp/x.mp3")).toBe(false)
  })

  it("treats relative paths as NOT a URL", () => {
    expect(looksLikeUrl("./upright.mp3")).toBe(false)
    expect(looksLikeUrl("upright.mp3")).toBe(false)
    expect(looksLikeUrl("../downloads/x.mp3")).toBe(false)
  })

  it("treats ~/ paths as NOT a URL", () => {
    expect(looksLikeUrl("~/Downloads/upright.mp3")).toBe(false)
  })

  it("treats file:// paths as NOT a URL (not the fetch surface we want)", () => {
    // The script would still try fetch() on file:// — but that's a different
    // failure. Test documents intent: only http(s) are treated as remote.
    expect(looksLikeUrl("file:///Users/x.mp3")).toBe(false)
  })

  it("does NOT match ftp/mailto/other schemes", () => {
    expect(looksLikeUrl("ftp://example.com/a.mp3")).toBe(false)
    expect(looksLikeUrl("mailto:kumar@example.com")).toBe(false)
  })
})
