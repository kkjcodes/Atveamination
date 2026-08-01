import sharp from "sharp"
import { uploadBlob } from "@/lib/storage/client"
import { prisma } from "@/lib/db/client"
import type { AssetKind } from "@prisma/client"

// Shared upload helper for business assets. EXIF-safe (per
// feedback_exif_orientation.md) and always records the Asset row so the
// business fork's UI can display/reuse the same image without hitting the
// blob CDN multiple times.

// Hard limits enforced BEFORE the file is buffered into memory. The 2 GiB
// container would otherwise be exposed to decompression-bomb + oversized-file
// attacks from any authenticated user.
const MAX_IMAGE_BYTES = 12 * 1024 * 1024        // 12 MB — comfortable for phone JPEGs
export const MAX_PIXELS = 40 * 1_000_000        // 40 megapixel — rejects "bomb" PNGs
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
])

// Audio limits — voice clone samples + Kokoro TTS inputs.
const MAX_AUDIO_BYTES = 8 * 1024 * 1024         // 8 MB — ~2min mp3, plenty for a voice sample
const ALLOWED_AUDIO_MIMES = new Set([
  "audio/webm", "audio/ogg", "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/m4a", "audio/mp4",
])

export function validateAudioFile(file: File): void {
  if (file.size > MAX_AUDIO_BYTES) {
    throw new UploadValidationError(413, `Audio too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max ${MAX_AUDIO_BYTES / 1024 / 1024}MB)`)
  }
  const mime = (file.type || "").toLowerCase().trim()
  if (mime && !ALLOWED_AUDIO_MIMES.has(mime)) {
    throw new UploadValidationError(415, `Unsupported audio type "${mime}" (allowed: WebM, OGG, MP3, WAV, M4A)`)
  }
}

export class UploadValidationError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// Validate a File BEFORE reading its bytes. Callers should catch
// UploadValidationError and translate to an HTTP response.
//
// Note: file.size is provided by the browser + parsed from multipart
// Content-Length; a malicious client can lie. We treat it as the fast-fail
// path — if the client says it's small enough, we still cap Sharp's
// pixel-density check downstream (which counts REAL decoded pixels).
export function validateImageFile(file: File): void {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new UploadValidationError(413, `Image too large (${(file.size / 1024 / 1024).toFixed(1)}MB, max ${MAX_IMAGE_BYTES / 1024 / 1024}MB)`)
  }
  const mime = (file.type || "").toLowerCase().trim()
  if (mime && !ALLOWED_IMAGE_MIMES.has(mime)) {
    throw new UploadValidationError(415, `Unsupported image type "${mime}" (allowed: JPEG, PNG, WebP, HEIC)`)
  }
}

export type UploadedAsset = {
  id: string
  url: string
  blobPath: string
  mimeType: string
  sizeBytes: number
}

export async function uploadAssetFromFile(
  file: File,
  userId: string,
  kind: AssetKind,
  blobPathPrefix: string,
): Promise<UploadedAsset> {
  // Fast-fail on client-declared size + MIME before reading bytes.
  validateImageFile(file)

  const rawBuffer = Buffer.from(await file.arrayBuffer())
  // Server-side size re-check (client may have lied about Content-Length).
  if (rawBuffer.length > MAX_IMAGE_BYTES) {
    throw new UploadValidationError(413, `Image too large after read (${rawBuffer.length} bytes)`)
  }

  // Read metadata WITHOUT decoding the full pixel data — Sharp streams the
  // header only. If pixel count exceeds MAX_PIXELS, reject before allocating
  // the raw buffer (decompression bomb defense).
  let preMeta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>
  try {
    preMeta = await sharp(rawBuffer).metadata()
  } catch (e) {
    throw new UploadValidationError(415, `Could not decode image: ${(e as Error)?.message ?? "unknown"}`)
  }
  const declaredPixels = (preMeta.width ?? 0) * (preMeta.height ?? 0)
  if (declaredPixels > MAX_PIXELS) {
    throw new UploadValidationError(413, `Image resolution too high (${preMeta.width}×${preMeta.height} = ${declaredPixels.toLocaleString()} pixels, max ${MAX_PIXELS.toLocaleString()})`)
  }

  // rotate() bakes EXIF orientation into pixels; jpeg() strips metadata.
  // Sharp's default limitInputPixels=268MP guards against runaway; our
  // MAX_PIXELS is stricter, checked above.
  const normalized = await sharp(rawBuffer).rotate().jpeg({ quality: 92 }).toBuffer()
  const meta = await sharp(normalized).metadata()

  const blobPath = `${blobPathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`
  const url = await uploadBlob(blobPath, normalized, "image/jpeg")

  const asset = await prisma.asset.create({
    data: {
      userId,
      kind,
      url,
      blobPath,
      mimeType: "image/jpeg",
      sizeBytes: normalized.length,
      meta: meta.width && meta.height
        ? { width: meta.width, height: meta.height }
        : undefined,
    },
  })

  return {
    id: asset.id,
    url,
    blobPath,
    mimeType: "image/jpeg",
    sizeBytes: normalized.length,
  }
}
