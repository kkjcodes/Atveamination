#!/usr/bin/env node
// Curate script — auto-tags, energy-picks the loudest 45s, trims + fades +
// loudnorms to −18 LUFS, uploads to Azure Blob, updates manifest.json.
//
// Two invocation modes:
//   1. Auto-slot (Kumar's day-to-day flow — scales without human approval):
//        node scripts/curate-music.mjs <local_or_url>
//        → tags computed, family + slot_id derived from tags, manifest updated
//
//   2. Force-slot (override for a specific slot):
//        node scripts/curate-music.mjs --slot <slot_id> <local_or_url>
//        → tags still computed, but placed in the named slot regardless
//
// Backends: local ffmpeg + music-tempo by default. If Essentia CLI is on the
// path, uses it (better tags). See scripts/music-tagger.mjs.
//
// Environment:
//   AZURE_STORAGE_CONNECTION_STRING — required to upload to blob. When unset,
//     script writes to /public only and the runtime uses that as fallback.
//   AZURE_STORAGE_CONTAINER_NAME — optional, defaults to "atveanimation".

import { spawn } from "child_process"
import { promises as fs } from "fs"
import { join, dirname } from "path"
import { fileURLToPath } from "url"
import { createHash } from "crypto"
import ffmpegStatic from "ffmpeg-static"
import { BlobServiceClient } from "@azure/storage-blob"
import { computeTags, deriveFamily, deriveSlotSlug } from "./music-tagger.mjs"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const PROJECT_ROOT = join(__dirname, "..")
const MANIFEST_PATH_REL = "public/business/music/manifest.json"

const FFMPEG = ffmpegStatic

// ── URL vs local file dispatch ──────────────────────────────────────────────

export function looksLikeUrl(source) {
  return /^https?:\/\//i.test(source.trim())
}

function expandUser(p) {
  if (p.startsWith("~/") || p === "~") return join(process.env.HOME || "", p.slice(1))
  return p
}

// ── ffmpeg wrappers ─────────────────────────────────────────────────────────

function runFfmpegCollectStderr(args) {
  return new Promise((resolve, reject) => {
    if (!FFMPEG) return reject(new Error("ffmpeg binary not available"))
    const child = spawn(FFMPEG, args)
    let stderr = ""
    child.stderr.on("data", (d) => { stderr += d.toString() })
    child.on("close", () => resolve(stderr))
    child.on("error", reject)
  })
}

// ── Loudest-window picker (unchanged logic, used to pick trim start) ────────

function parseRmsSeries(stderr) {
  const out = []
  const re = /Overall\.RMS_level=(-?\d+(?:\.\d+)?|-?inf)/g
  let m
  while ((m = re.exec(stderr)) !== null) {
    const v = m[1] === "-inf" ? Number.NEGATIVE_INFINITY : parseFloat(m[1])
    out.push(v)
  }
  return out
}

function dbSeriesToLinearEnergy(dbs) {
  return dbs.map((db) => (Number.isFinite(db) ? Math.pow(10, db / 20) : 0))
}

function findLoudestWindowStart(linearEnergy, windowSize) {
  if (linearEnergy.length === 0 || windowSize <= 0) return 0
  if (linearEnergy.length <= windowSize) return 0
  let sum = 0
  for (let i = 0; i < windowSize; i++) sum += linearEnergy[i]
  let bestSum = sum
  let bestStart = 0
  for (let i = windowSize; i < linearEnergy.length; i++) {
    sum += linearEnergy[i] - linearEnergy[i - windowSize]
    if (sum > bestSum) {
      bestSum = sum
      bestStart = i - windowSize + 1
    }
  }
  return bestStart
}

async function findLoudestWindow(inputPath, windowSec) {
  const stderr = await runFfmpegCollectStderr([
    "-nostats", "-hide_banner",
    "-i", inputPath,
    "-af", "asetnsamples=n=44100,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
    "-f", "null", "-",
  ])
  const rms = parseRmsSeries(stderr)
  const energy = dbSeriesToLinearEnergy(rms)
  const start = findLoudestWindowStart(energy, windowSec)
  return { startSec: start, sourceDurationSec: rms.length }
}

async function trimAndNormalize(inputPath, outputPath, startSec, durationSec) {
  if (!FFMPEG) throw new Error("ffmpeg binary not available")
  const fadeIn = 0.3
  const fadeOut = 0.6
  const fadeOutStart = Math.max(0, durationSec - fadeOut)

  return new Promise((resolve, reject) => {
    const args = [
      "-y", "-v", "error",
      "-ss", startSec.toFixed(3),
      "-i", inputPath,
      "-t", durationSec.toFixed(3),
      "-af", [
        `afade=type=in:st=0:d=${fadeIn.toFixed(2)}`,
        `afade=type=out:st=${fadeOutStart.toFixed(2)}:d=${fadeOut.toFixed(2)}`,
        "loudnorm=I=-18:LRA=7:TP=-1.5",
      ].join(","),
      "-c:a", "libmp3lame", "-b:a", "192k",
      outputPath,
    ]
    const child = spawn(FFMPEG, args)
    let stderr = ""
    child.stderr.on("data", (d) => { stderr += d.toString() })
    child.on("close", (code) => {
      if (code === 0) resolve()
      else reject(new Error(`ffmpeg trim exit ${code}: ${stderr.slice(-2000)}`))
    })
    child.on("error", reject)
  })
}

// ── Blob upload + manifest ──────────────────────────────────────────────────

async function uploadToBlob(localPath, blobPath) {
  const conn = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!conn) return null
  const container = process.env.AZURE_STORAGE_CONTAINER_NAME || "atveanimation"
  const client = BlobServiceClient.fromConnectionString(conn)
  const containerClient = client.getContainerClient(container)
  await containerClient.createIfNotExists({ access: "blob" })
  const blob = containerClient.getBlockBlobClient(blobPath)
  const buf = await fs.readFile(localPath)
  await blob.uploadData(buf, { blobHTTPHeaders: { blobContentType: "audio/mpeg" } })
  return blob.url
}

async function readManifest() {
  const manifestAbs = join(PROJECT_ROOT, MANIFEST_PATH_REL)
  try {
    return JSON.parse(await fs.readFile(manifestAbs, "utf8"))
  } catch {
    return {}
  }
}

async function writeManifest(manifest) {
  const manifestAbs = join(PROJECT_ROOT, MANIFEST_PATH_REL)
  await fs.mkdir(dirname(manifestAbs), { recursive: true })
  const sorted = Object.fromEntries(Object.keys(manifest).sort().map((k) => [k, manifest[k]]))
  await fs.writeFile(manifestAbs, JSON.stringify(sorted, null, 2) + "\n")
}

async function updateManifest(trackId, entry) {
  const current = await readManifest()
  current[trackId] = entry
  await writeManifest(current)
}

async function existingSlotsInFamily(family) {
  const manifest = await readManifest()
  return Object.keys(manifest).filter((id) => id.startsWith(`${family}_`))
}

// ── CLI arg parsing ─────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = argv.slice(2)
  let forcedSlot = null
  let source = null
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--slot" && i + 1 < args.length) {
      forcedSlot = args[i + 1]
      i++
    } else if (!source) {
      source = args[i]
    }
  }
  return { forcedSlot, source }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const { forcedSlot, source } = parseArgs(process.argv)

  if (!source) {
    console.error("Usage:")
    console.error("  node scripts/curate-music.mjs <local_or_url>              # auto-slot from tags")
    console.error("  node scripts/curate-music.mjs --slot <id> <local_or_url>  # force slot")
    console.error("")
    console.error("<local_or_url> can be a local file path or a direct http(s) URL.")
    console.error("Pixabay page URLs (pixabay.com/music/...) don't work — download the MP3 first.")
    process.exit(2)
  }

  const isUrl = looksLikeUrl(source)
  const tmpInput = join(process.env.TMPDIR || "/tmp", `atve_curate_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`)

  console.log(`▶ Curating ${source} (${isUrl ? "URL" : "local file"})`)

  let inputPath
  let cleanupTmp = false
  try {
    if (isUrl) {
      console.log("  downloading…")
      const res = await fetch(source)
      if (!res.ok) throw new Error(`download failed (${res.status}): ${source}`)
      await fs.writeFile(tmpInput, Buffer.from(await res.arrayBuffer()))
      inputPath = tmpInput
      cleanupTmp = true
    } else {
      const resolved = expandUser(source)
      try {
        await fs.access(resolved)
      } catch {
        throw new Error(`local file not found: ${resolved}`)
      }
      inputPath = resolved
    }

    // 1. Compute tags (tempo + energy + brightness + mood)
    console.log("  computing tags…")
    const tags = await computeTags(inputPath)
    console.log(`    source=${tags.source} bpm=${tags.bpm} energy=${tags.energy.toFixed(2)} brightness=${tags.brightness.toFixed(2)} mood=${tags.mood}`)

    // 2. Find loudest 45s window
    console.log("  analyzing energy per second…")
    const window = await findLoudestWindow(inputPath, 45)
    const durationToUse = Math.min(45, window.sourceDurationSec)
    console.log(`    loudest 45s window starts at ${window.startSec}s (source is ${window.sourceDurationSec}s)`)

    // 3. Derive family + slot
    // Family names contain underscores (clean_modern, bold_promo). Derive
    // family FIRST via deriveFamily(tags), then treat everything after
    // `${family}_` in the slot id as the slug.
    const family = forcedSlot
      ? (["clean_modern", "bold_promo", "scrapbook"].find((f) => forcedSlot.startsWith(`${f}_`)) || deriveFamily(tags))
      : deriveFamily(tags)
    let slotId
    if (forcedSlot) {
      slotId = forcedSlot
    } else {
      const existing = await existingSlotsInFamily(family)
      slotId = deriveSlotSlug(family, tags, existing)
    }
    // Slug = slot id with the "{family}_" prefix stripped.
    const slug = slotId.startsWith(`${family}_`) ? slotId.slice(family.length + 1) : slotId
    const localDestination = join(PROJECT_ROOT, "public", "business", "music", family, `${slug}.mp3`)
    console.log(`  slot: ${slotId} → family=${family}`)

    // 4. Trim + normalize
    console.log("  trimming, fading, normalizing to −18 LUFS…")
    await fs.mkdir(dirname(localDestination), { recursive: true })
    await trimAndNormalize(inputPath, localDestination, window.startSec, durationToUse)

    const buf = await fs.readFile(localDestination)
    const sha = createHash("sha256").update(buf).digest("hex").slice(0, 16)
    console.log(`✓ Written. sha256: ${sha}`)

    // 5. Blob upload (skipped if env unset)
    const blobPath = `business/music/${family}/${slug}.mp3`
    console.log("  uploading to blob…")
    const blobUrl = await uploadToBlob(localDestination, blobPath)
    if (blobUrl) {
      console.log(`✓ Uploaded: ${blobUrl}`)
    } else {
      console.log("  (skipped — AZURE_STORAGE_CONNECTION_STRING unset; runtime uses /public fallback)")
    }

    // 6. Manifest
    await updateManifest(slotId, {
      family,
      path: `/business/music/${family}/${slug}.mp3`,
      ...(blobUrl && { url: blobUrl }),
      tags,
      sha256_prefix: sha,
      curated_at: new Date().toISOString(),
    })
    console.log(`  manifest updated (${MANIFEST_PATH_REL})`)

    console.log(`\nLICENSES.md ledger entry:`)
    console.log(`| ${slotId} | ${source} | Pixabay CC0 | ${sha}... | ${window.startSec}s | pending |`)
  } finally {
    if (cleanupTmp) await fs.unlink(tmpInput).catch(() => {})
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error("FAIL:", e?.message ?? e)
    process.exit(1)
  })
}
