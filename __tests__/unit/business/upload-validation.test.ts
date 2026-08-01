import { describe, it, expect } from "vitest"
import {
  validateImageFile,
  validateAudioFile,
  UploadValidationError,
  MAX_PIXELS,
} from "@/lib/business/upload"

// Constructs a File without reading real bytes. `size` is what the browser
// reports via Content-Length — validators use it as the fast-fail signal.
function makeFile(size: number, type: string, name = "test.bin"): File {
  return new File([new Blob([new Uint8Array(0)])], name, { type }) as File & { size: number }
  // Note: File's `size` is derived from the Blob content in the browser but
  // vitest's File polyfill may not honor that. We override via Object.assign
  // in the callers below when needed.
}

function fileWithSize(size: number, type: string, name = "test.bin"): File {
  const f = makeFile(0, type, name)
  Object.defineProperty(f, "size", { value: size, configurable: true })
  return f
}

describe("validateImageFile — fast-fail before .arrayBuffer()", () => {
  it("accepts a normal-sized JPEG under the cap", () => {
    expect(() => validateImageFile(fileWithSize(2 * 1024 * 1024, "image/jpeg"))).not.toThrow()
  })

  it("rejects a JPEG over the 12MB cap with 413", () => {
    try {
      validateImageFile(fileWithSize(20 * 1024 * 1024, "image/jpeg"))
      throw new Error("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(UploadValidationError)
      expect((e as UploadValidationError).status).toBe(413)
      expect((e as Error).message).toMatch(/too large/)
    }
  })

  it("accepts PNG, WebP, HEIC MIMEs", () => {
    for (const mime of ["image/png", "image/webp", "image/heic", "image/heif"]) {
      expect(() => validateImageFile(fileWithSize(1024, mime))).not.toThrow()
    }
  })

  it("rejects wrong MIME with 415", () => {
    for (const mime of ["application/pdf", "video/mp4", "text/plain", "application/octet-stream"]) {
      try {
        validateImageFile(fileWithSize(1024, mime))
        throw new Error(`should have thrown for ${mime}`)
      } catch (e) {
        expect(e).toBeInstanceOf(UploadValidationError)
        expect((e as UploadValidationError).status).toBe(415)
      }
    }
  })

  it("accepts empty MIME (browser sometimes omits) — Sharp will re-validate on decode", () => {
    expect(() => validateImageFile(fileWithSize(1024, ""))).not.toThrow()
  })

  it("is case-insensitive on MIME", () => {
    expect(() => validateImageFile(fileWithSize(1024, "IMAGE/JPEG"))).not.toThrow()
    expect(() => validateImageFile(fileWithSize(1024, "Image/PNG"))).not.toThrow()
  })

  it("MAX_PIXELS is exposed for consumers who need the same cap in a stream flow", () => {
    expect(MAX_PIXELS).toBe(40 * 1_000_000)
  })
})

describe("validateAudioFile — voice sample cap", () => {
  it("accepts WebM (default browser recorder output)", () => {
    expect(() => validateAudioFile(fileWithSize(500 * 1024, "audio/webm"))).not.toThrow()
  })

  it("accepts common audio types", () => {
    for (const mime of ["audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav", "audio/m4a", "audio/mp4"]) {
      expect(() => validateAudioFile(fileWithSize(500 * 1024, mime))).not.toThrow()
    }
  })

  it("rejects over-8MB audio with 413", () => {
    try {
      validateAudioFile(fileWithSize(20 * 1024 * 1024, "audio/mp3"))
      throw new Error("should have thrown")
    } catch (e) {
      expect((e as UploadValidationError).status).toBe(413)
    }
  })

  it("rejects non-audio MIME with 415", () => {
    for (const mime of ["image/jpeg", "video/mp4", "application/pdf"]) {
      try {
        validateAudioFile(fileWithSize(1024, mime))
        throw new Error(`should have thrown for ${mime}`)
      } catch (e) {
        expect((e as UploadValidationError).status).toBe(415)
      }
    }
  })
})

describe("UploadValidationError", () => {
  it("carries status code + message", () => {
    const e = new UploadValidationError(413, "too big")
    expect(e.status).toBe(413)
    expect(e.message).toBe("too big")
    expect(e).toBeInstanceOf(Error)
  })
})
