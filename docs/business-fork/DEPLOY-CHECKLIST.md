# Business Fork — Deploy Checklist

**Read once before merging + shipping.** Everything below is verified against the shipped code in this branch.

---

## Code health as of this commit

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npx vitest run` | ✅ 424 tests, all pass (316 pre-fork + 108 new business tests) |
| `npx next build` | ✅ compiles; all routes registered |
| `npx eslint` (business fork paths) | ✅ clean (pre-existing warnings in unrelated files remain) |

Diff size against the branch start: 4 Prisma migrations, 26 source files, 8 test files, 2 docs.

## Pre-deploy steps (must do)

### 1. Music library (BLOCKING for audio-parity contract)

`lib/business/music-catalog.ts` references 9 tracks under `public/business/music/*` — **none are committed yet**. The M4 renderer detects missing files and falls back to a silent music bed, which fails doc §3.5 (`Mix and mute-parity`).

- [ ] Curate 3 tracks each for `clean_modern`, `bold_promo`, `scrapbook` from Pixabay Music (CC0)
- [ ] Trim to 30–60s, normalize to −18 LUFS: `ffmpeg -i in.mp3 -af "loudnorm=I=-18:LRA=7:TP=-1.5" out.mp3`
- [ ] Drop each into the paths named in `MUSIC_CATALOG`
- [ ] Fill in the ledger in `public/business/music/LICENSES.md` (source URL + SHA-256 per track)
- [ ] Kumar approves the list

### 2. Font (recommended, not blocking)

Handwriting font for captions:
- [ ] Confirm `public/scrapbook/handwriting.ttf` exists (already shipped for scrapbook feature; business render reuses it)
- If missing, the renderer falls back to sans — visible but not brand-consistent

### 3. Prisma migrations

Migrations auto-apply at container boot via `start.sh` (`prisma migrate deploy`). New migrations landing this deploy:

- `20260719120000_add_business_fork_m1` (Asset, Business, UserSegment)
- `20260719130000_add_ads_and_versions` (Ad, AdVersion, gallery_opt_in)
- `20260719140000_add_tts_cache` (TtsCache)
- `20260719150000_add_events` (Event)

- [ ] Verify a **backup** of production DB exists immediately before deploy (rollback path: `prisma migrate resolve --rolled-back` per migration)

### 4. Environment variables

**No new required vars.** All business fork endpoints reuse existing secrets:
- `ANTHROPIC_API_KEY` — Sonnet vision (adscript, iterate) + Haiku (moderation)
- `FAL_KEY` — Kokoro TTS
- `AZURE_STORAGE_CONNECTION_STRING` — renders + TTS cache blobs

**Optional new vars:**
- `KILL_SWITCH=1` — sets manual kill switch (503 all model-calling routes). Default: off.
- `MAX_MONTHLY_MODEL_CALLS=<N>` — auto-trip threshold. Default: 100,000.

- [ ] Confirm none of the above have changed on the container
- [ ] Set `MAX_MONTHLY_MODEL_CALLS` to something conservative for first week (e.g. 5,000)

### 5. Container image

- [ ] Build for `linux/amd64` per CLAUDE.md §8: `docker buildx build --platform linux/amd64 --push ...`
- [ ] Tag with a git-sha-derived tag so rollback = re-deploy previous tag

## Post-deploy verification (do within first hour)

### Smoke test the family fork (regression)

- [ ] Existing user logs in → dashboard loads → scene generation still works
- [ ] `/scrapbook` still lists prior projects
- [ ] `/character/[id]` still shows images with download/expand

### Smoke test the business fork (new)

- [ ] Anonymous visit to `/` → sees two-doors fork above existing marketing
- [ ] Click business door as anonymous → redirects to signup with `?redirect=/business&segment=business`
- [ ] After signup → lands on `/business` → shows "Create your first business" CTA
- [ ] `/business/new` → enter name → refresh → resume shows same name (progressive save works)
- [ ] Upload 3 photos + logo → each persists immediately
- [ ] Save & continue → `/business` shows the business in "ready" list
- [ ] Direct-hit `/api/business/[id]/ads` with `templateFamily=clean_modern, aspectRatio=9:16` → returns generated AdScript
- [ ] `/business/ads/[id]` → click Render → video appears within 90s
- [ ] "What would you change?" → apply edit → new version appears in sidebar
- [ ] Revert to v1 → v3 (or whatever) appears with "Reverted to version 1" note

### Analytics + kill switch

- [ ] Insert row: `SELECT * FROM events WHERE name IN ('flow_entered','business_created','render_completed') ORDER BY created_at DESC LIMIT 10;` — confirm events land
- [ ] Set `KILL_SWITCH=1` temporarily → confirm `/api/business/[id]/ads` returns 503 → unset

### Admin metrics

- [ ] User with `role=ADMIN` visits `/admin/metrics` → sees signups/ads/renders/median iterations
- [ ] Non-admin visits `/admin/metrics` → redirected to `/dashboard`

## Rollback plan

- **Code-only issue**: redeploy previous image tag (data is forward-compatible; new tables are additive)
- **Data-corruption issue**: restore Postgres from the pre-deploy backup, redeploy previous image tag
- **Runaway cost**: set env `KILL_SWITCH=1` immediately (503s all model endpoints, no data loss)

## What's shipped

Full list in `docs/business-fork/M0-inventory.md` and the milestone map at the end of `BUSINESS-FORK-HANDOFF.md`. Highlights:

- Landing fork (`<SegmentFork>` with two rooms)
- `Asset` table replaces scattered blob-URL columns
- `Business` + `Ad` + `AdVersion` + `TtsCache` + `Event` tables
- `/business` shell with resume-draft detection
- `/business/new` progressive-save onboarding
- `/business/ads/[id]` player + version sidebar + iterate loop + revert
- `/gallery` + `/gallery/[adId]` opt-in public pages with OG tags
- `/admin/metrics` (admin-only)
- Kill switch (env + auto-trip on monthly model call cap)
- Monthly render quotas (15/mo business, 3/mo family)
- Full event stream vocabulary (§7) emitted across every flow

## Known follow-ups (not blocking)

- Music library curation (see step 1 above)
- Family fork's `/family/*` route prefix wasn't adopted (kept existing paths — see M0 doc for rationale)
- Render endpoint is inline; if queue depth becomes real, split into a render-worker container per M0 note
- E2E browser tests would go beyond current vitest unit coverage — recommend Playwright when the fork moves past private beta
