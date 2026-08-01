// Music library — dynamic catalog driven by public/business/music/manifest.json.
//
// The manifest is written by scripts/curate-music.mjs during track curation.
// One entry per curated track: family, path (public fallback), url (blob), tags
// (bpm/energy/brightness/mood), sha256 prefix, curated_at timestamp.
//
// When manifest is missing (fresh dev checkout with no tracks yet), we fall
// back to a small hardcoded seed so builds/tests don't break.

import { promises as fs } from "fs"
import { publicPath } from "@/lib/paths"

export type MusicFamily = "clean_modern" | "bold_promo" | "scrapbook"

export type MusicTags = {
  bpm: number
  energy: number        // 0..1
  brightness: number    // 0..1
  dynamics: number      // 0..1 (RMS stddev)
  mood: string          // upbeat | calm | intense | peaceful | warm | holiday
  source: "essentia" | "local"
}

export type MusicTrack = {
  id: string            // e.g. "bold_promo_upbeat_fast"
  family: MusicFamily
  label: string         // human-readable — for admin UIs
  path: string          // /public path (fallback)
  url?: string          // Azure Blob URL (preferred at render time)
  tags?: MusicTags      // present for tracks curated via the script
}

type ManifestEntry = {
  family: MusicFamily
  path: string
  url?: string
  tags?: MusicTags
  sha256_prefix?: string
  curated_at?: string
}
type Manifest = Record<string, ManifestEntry>

// Seed catalog — used only when the manifest doesn't exist yet. Prevents
// AdScript generation from breaking in a fresh dev checkout.
const SEED_CATALOG: MusicTrack[] = [
  { id: "clean_modern_default", family: "clean_modern", label: "Placeholder — run npm run curate:music", path: "/business/music/clean_modern/default.mp3" },
  { id: "bold_promo_default",   family: "bold_promo",   label: "Placeholder — run npm run curate:music", path: "/business/music/bold_promo/default.mp3" },
  { id: "scrapbook_default",    family: "scrapbook",    label: "Placeholder — run npm run curate:music", path: "/business/music/scrapbook/default.mp3" },
]

let _catalogCache: MusicTrack[] | undefined

async function loadManifest(): Promise<Manifest | null> {
  const manifestPath = publicPath("business/music/manifest.json")
  try {
    const raw = await fs.readFile(manifestPath, "utf8")
    return JSON.parse(raw) as Manifest
  } catch {
    return null
  }
}

export async function getMusicCatalog(): Promise<MusicTrack[]> {
  if (_catalogCache !== undefined) return _catalogCache
  const manifest = await loadManifest()
  if (!manifest || Object.keys(manifest).length === 0) {
    _catalogCache = SEED_CATALOG
    return _catalogCache
  }
  const tracks: MusicTrack[] = []
  for (const [id, entry] of Object.entries(manifest)) {
    tracks.push({
      id,
      family: entry.family,
      label: labelFromId(id, entry.tags),
      path: entry.path,
      url: entry.url,
      tags: entry.tags,
    })
  }
  _catalogCache = tracks
  return tracks
}

export function _resetMusicCatalogCache(): void {
  _catalogCache = undefined
}

function labelFromId(id: string, tags?: MusicTags): string {
  const parts = id.split("_")
  const family = parts.slice(0, 2).join(" ")
  const rest = parts.slice(2).join(" ") || "default"
  if (tags) return `${family} — ${rest} (bpm ${tags.bpm}, ${tags.mood})`
  return `${family} — ${rest}`
}

export async function musicForFamily(family: string): Promise<MusicTrack[]> {
  const catalog = await getMusicCatalog()
  return catalog.filter((m) => m.family === family)
}

export async function trackById(id: string): Promise<MusicTrack | null> {
  const catalog = await getMusicCatalog()
  return catalog.find((m) => m.id === id) ?? null
}

export async function resolveMusicSource(trackId: string): Promise<string | null> {
  const track = await trackById(trackId)
  if (!track) return null
  if (track.url) return track.url
  return publicPath(track.path.replace(/^\//, ""))
}

// Back-compat re-export — legacy consumers that don't await the dynamic
// catalog. Points at the seed.
export const MUSIC_CATALOG: MusicTrack[] = SEED_CATALOG

// Legacy alias for the manifest cache reset (kept for old tests).
export const _resetMusicManifestCache = _resetMusicCatalogCache
