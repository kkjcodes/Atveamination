# M0 — Repo Inventory for Business Fork

**Audience:** Anyone implementing M1-M7.
**Purpose:** Name concrete file paths for every integration point so no milestone re-derives them.

---

## Stack (as observed)

| Layer | What we run | Where it lives |
|---|---|---|
| Framework | Next.js 16 App Router, Turbopack standalone bundle, TypeScript | `next.config.ts`, `app/` |
| Node runtime | API routes run in Node runtime (needed for ffmpeg/sharp) | Route files export runtime implicitly (default) |
| Auth | NextAuth v4 credentials + CSRF + session cookie | `lib/auth/config.ts`, `middleware.ts` |
| DB | Postgres Flexible Server + Prisma 7 | `prisma/schema.prisma`, `lib/db/client.ts` |
| Migrations | Applied at container boot | `start.sh` runs `prisma migrate deploy`; files under `prisma/migrations/` |
| Storage | Azure Blob (`access: "blob"` → public-read direct URLs) | `lib/storage/client.ts` |
| Compute | Azure Container Apps (scale-to-zero, 1 vCPU / 2 GiB) | `azure.yaml`, `Dockerfile` |
| ffmpeg | `ffmpeg-static` + `ffprobe-static` (bundled binaries) | Init pattern in `lib/video/concat.ts:7-16` |
| Sharp | EXIF-safe image processing | `app/api/characters/route.ts:51` |
| Testing | vitest (316 tests passing) | `__tests__/unit/**`, `vitest.config.ts` |

---

## Concrete integration points (by concern)

### Auth
- **Session read:** `import { getServerSession } from "next-auth"` + `import { authOptions } from "@/lib/auth/config"`
- **Guard pattern:** `if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })`
- **Session shape:** `session.user.id`, `session.user.email`, `session.user.name`, `session.user.role` (`FREE | SUPER_USER | ADMIN`)
- **Route protection:** `middleware.ts` (public paths: `/`, `/auth/*`, `/api/auth/*`)

### User model (must extend for M1)
```
User { id, email(unique), password, name?, role UserRole@default(FREE),
       passwordResetToken?, passwordResetExpiry?, createdAt }
```
**M1 addition:** `segment` nullable enum `family | business | both` — nullable so existing users default to null until they pick a door.

### Upload flow (reuse verbatim for M2)
Reference: `app/api/characters/route.ts:32-70`
- `formData.get("photo") as File | null`
- `sharp(rawBuffer).rotate().jpeg({ quality: 92 }).toBuffer()` — bakes EXIF orientation into pixels
- `uploadBlob(blobPath, buffer, "image/jpeg")` from `lib/storage/client.ts`
- Return the resulting public URL

For M2 business photos: same three-step pattern. Blob path convention: `business/{businessId}/photos/{Date.now()}_{random}.jpg`.

### Storage client
- `uploadBlob(path: string, data: Buffer, contentType: string): Promise<string>` → public URL
- `mirrorUrlToBlob(sourceUrl: string, blobPath: string): Promise<string>` — copies a remote fal/replicate URL into our blob

### Job queue
**None exists.** Async work uses one of two patterns:
1. **fal webhook** — `fal.queue.submit` returns a `request_id`; completion arrives at `app/api/webhooks/fal/route.ts` and advances DB state. Used by the scene pipeline and scrapbook dynamic route.
2. **Synchronous fal.subscribe with maxDuration** — the handler blocks on the fal call for up to `maxDuration` seconds. Used by scrapbook subtle route (`app/api/scrapbook/pages/[id]/generate/route.ts:8`).

**M4 decision (from planning):** ffmpeg render will be inline with `maxDuration=540` — matches `app/api/scrapbook/projects/[id]/stitch/route.ts:9`. If we hit Container Apps' 240s HTTP timeout under queue depth (risk noted in plan), the smallest fix is splitting into a render-worker container, not adding BullMQ.

### Video render entry (M4 reuse)
- **Ken Burns still-to-video** — `lib/scrapbook/assemble.ts:kenBurnsClip` (upscale-first + zoompan trick)
- **Page composite** — `lib/scrapbook/assemble.ts:composePage` (photo + border + rotation + caption drawtext). **Currently hardcoded 1920×1080** — M4 must parameterize aspect ratio.
- **xfade page-turn join** — `lib/scrapbook/assemble.ts:joinPages` (`transition=wipeleft`, 0.5s). Direct reuse for `scrapbook` template family.
- **Video+audio merge** — `lib/video/concat.ts:mergeVideoAudio` (pad-with-silence-not-trim behavior; `apad` for short audio, `atrim`+`afade` for long audio).
- **Multi-clip concat** — `lib/video/concat.ts:concatVideoChunks` (stream-copy N chunks, trim to targetSeconds).
- **Final scrapbook end-to-end** — `lib/scrapbook/assemble.ts:assembleScrapbook` (download → composite → concat → upload). Copy the download+work-dir+cleanup pattern.

### TTS (Kokoro — M3b reuse)
- **Client:** `fal` from `lib/fal/client.ts`; endpoint `FAL_MODELS.kokoro = "fal-ai/kokoro"`
- **Call pattern:** `app/api/scenes/[id]/route.ts:236` — `fal.subscribe(FAL_MODELS.kokoro, { input: { text, voice, language, speed } })`
- **Response shape handling:** `d?.audio?.url ?? d?.audio_url ?? d?.audio_file?.url` (all three variants observed historically)
- **Language codes:** `en | hi | es` per `VoiceLanguage` type; derived from voice ID prefix via `languageForVoice(voiceId)`
- **Speed control:** `kokoroSpeedForBudget(text, targetSec, language)` — clamps 1.0-1.15×
- **Available voice IDs:** 18 preset voices in `PRESET_VOICES` (`af_*`/`am_*`/`bf_*`/`bm_*`/`hf_*`/`hm_*`/`ef_*`/`em_*`)
- **M3b voice pinning (locked):** `warm_f=af_heart`, `confident_m=am_michael`, `energetic_f=af_sarah`, `calm_m=bm_george`

### Rate limits (M7 pattern)
Reference: `lib/limits.ts`
- `checkSceneLimit`, `checkBriefLimit`, `checkScrapbookLimit`, `checkTrainingLimit` all share the same shape
- `LimitCheck { allowed, used, limit, resetsAt }`
- Daily limits count Job rows with `type` matching + `createdAt >= startOfTodayUTC()`
- `SUPER_USER` and `ADMIN` bypass via `isUnlimited(role)`
- Log usage: `logUsage(userId, type, entityId, entityType)` — inserts a Job row

**M7 additions:** `checkBusinessRenderLimit` (15/month), `checkFamilyRenderLimit` (3/month). Monthly limits need a new `startOfMonthUTC()` helper.

### Analytics events (M7)
No existing `events` table. Options: extend `Job` (append type=`event_*`) OR add dedicated `Event` table. Recommend `Event { id, userId?, name, props Json, createdAt }` — cleaner separation than overloading Job.

### Env vars (existing — reused)
- `DATABASE_URL`
- `AZURE_STORAGE_CONNECTION_STRING`
- `NEXTAUTH_SECRET` + `NEXTAUTH_URL`
- `FAL_KEY` (**never print** per `feedback_model_migrations.md`)
- `REPLICATE_API_TOKEN`
- `ANTHROPIC_API_KEY`
- `WEBHOOK_BASE_URL`, `WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`

**M7 addition:** `KILL_SWITCH=1` env → 503 with maintenance message on all model-calling routes. `MAX_MONTHLY_MODEL_CALLS` numeric → auto-trip kill switch when exceeded.

### Model client + prompt patterns
- Anthropic: `anthropic` from `lib/ai/client.ts`. Models: `VISION_MODEL = "claude-sonnet-4-6"`, `BRIEF_MODEL = "claude-haiku-4-5-20251001"`
- **Strict-JSON parse pattern:** `lib/scrapbook/vision-parse.ts:parseVisionJson` — strips ``` fences, extracts outermost braces. **Reuse for M3.**

### Nav + auth-gated routes
- `components/nav.tsx` — sticky header; shows Dashboard/Scrapbook/Help/SignOut when authenticated; SignIn/GetStarted otherwise.
- **M1 additions:** none directly to nav (fork is on landing page); a "For Businesses" link may be added conditionally based on `segment`.

### Existing top-level routes
`/`, `/dashboard`, `/character/*`, `/studio/*`, `/scrapbook/*`, `/voice/*`, `/help`, `/auth/*`, `/privacy`, `/api/*`.

**M1 decision (locked):** family routes stay where they are. `/business/*` is the only new physical mount. Landing `/` gets the fork.

---

## Files most likely to be touched per milestone

| Milestone | Files |
|---|---|
| M1 | `app/page.tsx`, `prisma/schema.prisma` + new migration, `app/business/page.tsx` (new), `app/business/new/page.tsx` (new), `app/api/segment/route.ts` (new), `components/nav.tsx` |
| M2 | `prisma/schema.prisma`, `app/business/new/page.tsx`, `app/api/business/route.ts`, `app/api/business/[id]/photos/route.ts`, `app/api/business/[id]/logo/route.ts`, `lib/business/upload.ts` |
| M3 | `lib/business/adscript.ts`, `lib/business/adscript-schema.ts` (Zod), `app/api/business/ads/route.ts`, `app/api/business/ads/[id]/generate/route.ts`, `prisma/schema.prisma` |
| M3b | `lib/business/tts.ts`, `lib/business/music.ts`, `public/business/music/*/*.mp3`, `public/business/music/LICENSES.md` |
| M4 | `lib/business/render.ts`, `lib/business/templates/clean-modern.ts`, `lib/business/templates/bold-promo.ts`, `lib/business/templates/scrapbook.ts`, `lib/business/audio-mix.ts`, `app/api/business/ads/[id]/render/route.ts`, `public/business/watermark.png` |
| M5 | `app/business/ads/[id]/page.tsx`, `app/api/business/ads/[id]/edit/route.ts`, `app/api/business/ads/[id]/revert/route.ts` |
| M6 | `app/gallery/page.tsx`, `app/gallery/[adId]/page.tsx`, `app/api/gallery/route.ts`, `app/api/business/ads/[id]/opt-in/route.ts` |
| M7 | `prisma/schema.prisma`, `lib/limits.ts`, `lib/events.ts`, `middleware.ts` (kill switch), `app/admin/metrics/page.tsx`, per-milestone event emit call sites |

---

## Files NOT to touch without explicit ask (per CLAUDE.md)

- `README.md`
- `nextsteps.md`, `advertising.md`, `Episodes.md` (gitignored personal docs)
- Existing `prisma/migrations/*` — append only
- Existing family scene pipeline (`app/api/scenes/*`, `app/api/webhooks/{fal,replicate}/*`) except to add kill-switch middleware in M7

---

## Gate check

- [x] Auth hook named — `getServerSession(authOptions)` from `lib/auth/config.ts`
- [x] Upload handler named — pattern in `app/api/characters/route.ts:32-70`
- [x] Job enqueue answered — **no queue**, use inline `maxDuration=540` per scrapbook stitch precedent
- [x] Video render entry point named — `lib/scrapbook/assemble.ts` (assembleScrapbook, composePage, joinPages, kenBurnsClip) + `lib/video/concat.ts` (mergeVideoAudio, concatVideoChunks)
