# Music Library Licenses

**Policy:** Every track shipped with the business fork must be CC0 or a
one-time buyout with commercial redistribution rights. Kumar approves the
final list before shipping M3b.

**Source of truth:** `lib/business/music-catalog.ts`. Any track listed there
must have an entry in the ledger below with source + license + SHA-256.

## How to curate a track

Pixabay's CDN blocks automated fetches (403 on browser-less requests).
Workflow is:

1. Open the Pixabay page in your browser
2. Click "Download" → save the MP3 locally (e.g. `~/Downloads/pan-flute.mp3`)
3. Run:
   ```
   npm run curate:music -- <track_id> <local_path_or_direct_url>
   ```

The script accepts either a local file path or a direct `http(s)://...mp3`
URL. It auto-detects and dispatches accordingly.

Examples:
```
npm run curate:music -- scrapbook_polaroid ~/Downloads/pan-flute-greensleeves.mp3
npm run curate:music -- clean_modern_upright "https://cdn.example.com/upright.mp3"
```

(Plain node — no tsx/ts-node required. Uses the bundled ffmpeg-static binary.)

The script downloads, analyzes per-second RMS energy, finds the loudest
continuous 45-second window, trims + fades + normalizes to −18 LUFS, and
writes to the exact path the runtime expects (`public/business/music/{family}/{slug}.mp3`).
The 45s trim covers doc §3's max ad duration (35s scenes + 1.5s outro).

### Track slots to fill

Track IDs are locked in `lib/business/music-catalog.ts`. Send one Pixabay URL
per ID below:

#### clean_modern (calm, tasteful)
- `clean_modern_upright`  — solo upright piano, calm/tasteful
- `clean_modern_gauze`    — ambient pads, neutral tone
- `clean_modern_daylight` — soft acoustic, morning feel

#### bold_promo (snappy, high-energy)
- `bold_promo_openmarket` — market bustle, energetic
- `bold_promo_pulse`      — synth pulse, promo-forward
- `bold_promo_showtime`   — brassy, announcement

#### scrapbook (warm, nostalgic)
- `scrapbook_polaroid` — nostalgic piano
- `scrapbook_ribbon`   — warm strings, gentle
- `scrapbook_home`     — folk guitar, home-hearth

## Track ledger

Filled by the curate script (which prints a ready-to-paste row after each
successful run). Kumar approves before commit.

| Track ID | Source URL | License | SHA-256 (prefix) | Loudest window start | Approved |
|---|---|---|---|---|---|
| — | — | — | — | — | — |

## Manual override (not recommended)

If auto-detection picks the wrong section (rare — algorithm optimizes for
loudest, not "best" — occasionally lands on a bridge instead of the chorus),
you can:

1. Download the source manually
2. Trim with your preferred start time: `ffmpeg -ss 24 -i source.mp3 -t 45 -af "afade=in:st=0:d=0.3,afade=out:st=44.4:d=0.6,loudnorm=I=-18:LRA=7:TP=-1.5" -c:a libmp3lame -b:a 192k public/business/music/{family}/{slug}.mp3`
3. Add a note in the ledger

## What happens if a track is missing at render time

`lib/business/render/audio-mix.ts` checks file existence before adding music
to the mix. Missing file → silent music bed. Renders still complete, but they
fail doc §3.5's audio-parity contract (feeds autoplay muted; ad must
communicate silently AND sound complete with audio on).

## What happens if a track is shorter than needed

`stream_loop -1` in the mixer wraps back to 0:00 with an audible seam. Every
curated track is 45s → covers max ad duration (36.5s) with 8.5s buffer. If a
non-curated track slips in shorter than that, expect the seam.
