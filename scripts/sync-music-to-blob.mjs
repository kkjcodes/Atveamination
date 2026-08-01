#!/usr/bin/env node
// Deploy-time music sync — runs from start.sh on every container boot.
//
// Purpose: keep Azure Blob in sync with the curated MP3s under
// public/business/music/. Any file whose SHA-256 doesn't match its manifest
// entry (or that has no entry) gets uploaded. Manifest is rewritten with the
// fresh URLs so the running app sees the blob URLs, not the /public paths.
//
// Idempotent: subsequent runs skip files that already match blob. Cheap —
// SHA compute is fast and blob upload is skipped for unchanged files.
//
// When AZURE_STORAGE_CONNECTION_STRING is unset (dev machine), the script
// logs a warning and exits 0 so start.sh continues (the app still runs off
// /public fallback in that case).
//
// The script scans:
//   public/business/music/{family}/*.mp3
//
// It reads and writes:
//   public/business/music/manifest.json
//
// Anything found under public/business/music/ but NOT in the manifest is
// still uploaded (best-effort) with a warning — surfaces the fact that a
// track was dropped in without going through curate-music.mjs (so it's
// missing tags + won't appear in the AdScript vocabulary until Kumar runs
// curate-music on it).

import { promises as fs } from "fs"
import { join, dirname, basename } from "path"
import { fileURLToPath } from "url"
import { createHash } from "crypto"
import { BlobServiceClient } from "@azure/storage-blob"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, "..")
const MUSIC_ROOT = join(PROJECT_ROOT, "public", "business", "music")
const MANIFEST_PATH = join(MUSIC_ROOT, "manifest.json")

// ── Helpers ────────────────────────────────────────────────────────────────

export function sha256Prefix(buf, len = 16) {
  return createHash("sha256").update(buf).digest("hex").slice(0, len)
}

// Walk a directory, yielding all files ending in .mp3.
export async function findMp3s(rootDir) {
  const out = []
  async function walk(dir) {
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return  // dir doesn't exist yet — first deploy before curation
    }
    for (const e of entries) {
      const full = join(dir, e.name)
      if (e.isDirectory()) await walk(full)
      else if (e.isFile() && e.name.toLowerCase().endsWith(".mp3")) out.push(full)
    }
  }
  await walk(rootDir)
  return out.sort()
}

// Derive blob path from local path. Given a file at
// /project/public/business/music/clean_modern/peaceful_mid.mp3, returns
// business/music/clean_modern/peaceful_mid.mp3.
export function blobPathFromLocal(localPath, projectRoot) {
  const rel = localPath.slice(projectRoot.length + 1)   // strip project prefix
  const stripped = rel.startsWith("public/") ? rel.slice("public/".length) : rel
  return stripped
}

// Derive the (family, slug) tuple from a curated file's blob path.
// business/music/{family}/{slug}.mp3 → { family, slug }.
export function familySlugFromBlobPath(blobPath) {
  const parts = blobPath.split("/")
  // Expected: ["business", "music", "<family>", "<slug>.mp3"]
  if (parts.length !== 4 || parts[0] !== "business" || parts[1] !== "music") return null
  return { family: parts[2], slug: parts[3].replace(/\.mp3$/i, "") }
}

// ── Manifest I/O ────────────────────────────────────────────────────────────

async function readManifest() {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_PATH, "utf8"))
  } catch {
    return {}
  }
}

async function writeManifest(m) {
  await fs.mkdir(dirname(MANIFEST_PATH), { recursive: true })
  const sorted = Object.fromEntries(Object.keys(m).sort().map((k) => [k, m[k]]))
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(sorted, null, 2) + "\n")
}

// ── Blob client ─────────────────────────────────────────────────────────────

function makeBlobClient() {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!conn) return null
  const container = process.env.AZURE_STORAGE_CONTAINER_NAME || "atveanimation"
  const client = BlobServiceClient.fromConnectionString(conn)
  const containerClient = client.getContainerClient(container)
  return { client, containerClient, containerName: container }
}

// Look up the manifest entry that corresponds to a given local file. The
// manifest's `path` field is written by curate-music.mjs as
// "/business/music/{family}/{slug}.mp3" (with leading slash, mirroring the
// /public/ layout). Blob path is "business/music/{family}/{slug}.mp3" (no
// leading slash). Compare after normalizing both to the leading-slash form.
export function findManifestEntryForBlobPath(manifest, blobPath) {
  const targetPath = "/" + blobPath   // "/business/music/{family}/{slug}.mp3"
  for (const [id, entry] of Object.entries(manifest)) {
    if (entry.path === targetPath) return { id, entry }
  }
  return null
}

// Decide whether a file needs uploading. Reasons:
//   1. Manifest has no entry for this file's blob path (unregistered — upload anyway)
//   2. Manifest entry has no `url` field (never uploaded)
//   3. Manifest entry's `sha256_prefix` doesn't match this file's SHA (drift)
export function needsUpload(manifest, blobPath, sha) {
  const match = findManifestEntryForBlobPath(manifest, blobPath)
  if (!match) return { upload: true, reason: "unregistered" }
  const entry = match.entry
  if (!entry.url) return { upload: true, reason: "no-url", id: match.id }
  if (entry.sha256_prefix && entry.sha256_prefix !== sha) {
    return { upload: true, reason: "sha-drift", id: match.id }
  }
  return { upload: false, id: match.id }
}

async function uploadOne(containerClient, blobPath, buf) {
  const blob = containerClient.getBlockBlobClient(blobPath)
  await blob.uploadData(buf, { blobHTTPHeaders: { blobContentType: "audio/mpeg" } })
  return blob.url
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function syncMusic({ dryRun = false, log = console.log } = {}) {
  const client = makeBlobClient()
  const mp3s = await findMp3s(MUSIC_ROOT)
  const manifest = await readManifest()

  const summary = { scanned: mp3s.length, uploaded: 0, skipped: 0, warnings: [] }

  if (mp3s.length === 0) {
    log("[sync-music] No .mp3 files under public/business/music — nothing to do.")
    return summary
  }

  if (!client) {
    log("[sync-music] AZURE_STORAGE_CONNECTION_STRING unset — skipping blob upload. App will use /public fallback.")
    return { ...summary, skipped: mp3s.length, warnings: ["AZURE_STORAGE_CONNECTION_STRING unset"] }
  }

  // Ensure container exists (idempotent) — one round-trip.
  if (!dryRun) {
    await client.containerClient.createIfNotExists({ access: "blob" })
  }

  let manifestDirty = false

  for (const localPath of mp3s) {
    const buf = await fs.readFile(localPath)
    const sha = sha256Prefix(buf)
    const blobPath = blobPathFromLocal(localPath, PROJECT_ROOT)
    const decision = needsUpload(manifest, blobPath, sha)

    if (!decision.upload) {
      summary.skipped++
      continue
    }

    log(`[sync-music] uploading ${basename(localPath)} (reason: ${decision.reason})`)

    let url
    if (dryRun) {
      url = `dry-run://${client.containerName}/${blobPath}`
    } else {
      url = await uploadOne(client.containerClient, blobPath, buf)
    }
    summary.uploaded++

    // Update manifest entry (create + register if missing so scale-up scripts
    // notice unregistered files).
    if (decision.id) {
      manifest[decision.id] = {
        ...manifest[decision.id],
        url,
        sha256_prefix: sha,
      }
    } else {
      // Unregistered file — surface as a warning + register minimally so
      // the runtime can still resolve it (family derived from path).
      const fs2 = familySlugFromBlobPath(blobPath)
      if (fs2) {
        const generatedId = `${fs2.family}_${fs2.slug}`
        summary.warnings.push(
          `Unregistered file "${basename(localPath)}" auto-registered as ${generatedId} — run curate-music to add proper tags.`,
        )
        manifest[generatedId] = {
          family: fs2.family,
          path: "/" + blobPath.replace(/^business\//, ""),
          url,
          sha256_prefix: sha,
          curated_at: new Date().toISOString(),
          auto_registered_by_sync: true,
        }
      } else {
        summary.warnings.push(
          `File "${basename(localPath)}" at unexpected path "${blobPath}" — expected business/music/{family}/{slug}.mp3`,
        )
      }
    }
    manifestDirty = true
  }

  if (manifestDirty && !dryRun) {
    await writeManifest(manifest)
    log(`[sync-music] manifest updated with fresh blob URLs`)
  }

  log(`[sync-music] done: scanned=${summary.scanned} uploaded=${summary.uploaded} skipped=${summary.skipped}`)
  if (summary.warnings.length > 0) {
    for (const w of summary.warnings) log(`[sync-music] WARN: ${w}`)
  }
  return summary
}

// Auto-run when invoked as a script.
if (import.meta.url === `file://${process.argv[1]}`) {
  syncMusic().catch((e) => {
    console.error("[sync-music] FAIL:", e?.message ?? e)
    // Non-fatal: exit 0 so start.sh continues booting. Missing blob URLs
    // just mean the runtime falls back to /public.
    process.exit(0)
  })
}
