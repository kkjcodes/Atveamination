import { describe, it, expect } from "vitest"
import { safeRedirect } from "@/lib/safe-redirect"

describe("safeRedirect — open-redirect prevention", () => {
  describe("accepted destinations", () => {
    it.each([
      "/dashboard",
      "/business",
      "/business/new",
      "/personal",
      "/scrapbook",
      "/scrapbook/new",
      "/gallery",
    ])("allows canonical path: %s", (path) => {
      expect(safeRedirect(path)).toBe(path)
    })

    it.each([
      "/business/abc-123",
      "/scrapbook/abc-123",
      "/studio/proj-1",
      "/character/char-1",
      "/voice/char-1",
    ])("allows child of allowlisted prefix: %s", (path) => {
      expect(safeRedirect(path)).toBe(path)
    })

    it("preserves query string on allowed paths", () => {
      expect(safeRedirect("/business/new?template=bold")).toBe("/business/new?template=bold")
    })
  })

  describe("rejected destinations", () => {
    it("rejects null/undefined/empty", () => {
      expect(safeRedirect(null)).toBe("/dashboard")
      expect(safeRedirect(undefined)).toBe("/dashboard")
      expect(safeRedirect("")).toBe("/dashboard")
    })

    it.each([
      "https://evil.com",
      "http://evil.com",
      "https://evil.com/dashboard",
      "javascript:alert(1)",
    ])("rejects absolute URLs: %s", (url) => {
      expect(safeRedirect(url)).toBe("/dashboard")
    })

    it("rejects protocol-relative URLs", () => {
      // The classic bypass — resolves to https://evil.com in a browser.
      expect(safeRedirect("//evil.com")).toBe("/dashboard")
      expect(safeRedirect("//evil.com/dashboard")).toBe("/dashboard")
    })

    it("rejects backslash bypasses (the flaw in the previous guard)", () => {
      // Browsers normalize backslash to forward slash; a naive `startsWith("/")
      // && !startsWith("//")` accepted these and shipped users off-site.
      expect(safeRedirect("/\\evil.com")).toBe("/dashboard")
      expect(safeRedirect("\\/evil.com")).toBe("/dashboard")
      expect(safeRedirect("\\\\evil.com")).toBe("/dashboard")
    })

    it("rejects encoded backslash bypasses", () => {
      // /%5Cevil.com decodes to /\evil.com. URL() parses the encoded form,
      // but the encoded backslash still doesn't route anywhere useful — it
      // will end up on a 404. The safeguard is to reject any encoded
      // backslashes explicitly, since URL() percent-decodes and the string
      // check above catches raw `\` but not `%5C`. Guard both.
      // (Currently URL() keeps %5C in the path so our allowlist rejects it.
      // If future browsers or Next behavior differs, add a decode-and-check
      // pass.)
      expect(safeRedirect("/%5Cevil.com")).toBe("/dashboard")
    })

    it("rejects unknown app paths", () => {
      expect(safeRedirect("/admin/dashboard")).toBe("/dashboard")
      expect(safeRedirect("/api/auth/session")).toBe("/dashboard")
      expect(safeRedirect("/foo/bar")).toBe("/dashboard")
    })

    it("rejects data: URIs", () => {
      expect(safeRedirect("data:text/html,<script>alert(1)</script>")).toBe("/dashboard")
    })

    it("respects custom fallback", () => {
      expect(safeRedirect("https://evil.com", "/business")).toBe("/business")
      expect(safeRedirect(null, "/business")).toBe("/business")
    })
  })
})
