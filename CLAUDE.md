## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

## 5. Build for deployment

Build code keeping ease of ops and deployment in mind.
From starting point, create code with deployment pipeline in mind.
Deployment should ideally be 1 click.

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

# Operational context for future sessions

The sections below were written to make a fresh session immediately productive without re-deriving the pipeline. Read them in order. They cover what's built, what's deployed, how to deploy, how to debug the failures that actually happened in production, and how to run end-to-end tests.

## 6. Product context

**atveanimation.com** — personalized photo-to-cartoon-video product. Solo-built by Kumar Krishnanand (kumar.krishnanand@gmail.com). In production on Azure Container Apps.

Pipeline at a glance: user uploads a photo → we generate a cartoon avatar → user describes a video → we generate scene-by-scene cartoon clips with voice and lip sync → stitched into a final MP4.

Free tier: 10 scenes/day. SUPER_USER role bypasses some limits. PRO/AGENCY roles planned for the B2B fork (see `advertising.md`) but not built.

## 7. Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 16 App Router, Turbopack standalone bundle |
| Backend | Next.js API routes, Node runtime |
| Auth | NextAuth v4 credentials + CSRF + session cookie |
| DB | Postgres Flexible Server + Prisma 7 |
| Storage | Azure Blob Storage, `access: "blob"` (public-read) |
| Compute | Azure Container Apps, 1 vCPU / 2 GiB, scale-to-zero |
| Registry | Azure Container Registry |
| AI: vision | Anthropic Sonnet 4.6 (`claude-sonnet-4-6`) — identity-critical describes |
| AI: brief / moderation | Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`) |
| AI: style transfer | Replicate `flux-kontext-pro` ($0.04) |
| AI: LoRA | `fal-ai/flux-lora` ($0.04 inference), `fal-ai/flux-lora-fast-training` ($0.40) |
| AI: multi-character | `fal-ai/flux-pro/kontext/multi` ($0.05) — "Multi-Kontext" |
| AI: video | `fal-ai/wan-i2v` ($0.40/clip @720p, $0.50 with >81 frames) |
| AI: lip sync | `bytedance/latentsync` (Replicate) — skipped on shared scenes |
| AI: TTS | `fal-ai/kokoro` ($0.005/clip) |
| AI: voice clone | `xtts-v2` (Replicate) — wired but not exposed in UI |
| AI: STT | `whisper` (Replicate) |

**Model migration policy:** ALWAYS flag provider switches (Replicate → fal.ai, model deprecations) as breaking-change risk BEFORE coding. Silent migrations break existing LoRAs and characters. Saved as memory `feedback_model_migrations.md`.

## 8. Deployment

### Build (Apple Silicon host)
```
docker buildx build --platform linux/amd64 --push -t <acr>.azurecr.io/atve-app:<tag> .
```
The `--platform linux/amd64` flag is REQUIRED on Apple Silicon. Default arm64 builds won't run on Container Apps.

### Deploy
```
az containerapp update --name <app> --resource-group <rg> --image <acr>.azurecr.io/atve-app:<tag>
```

### Prisma migrations
Run automatically on container boot via `start.sh`:
```
prisma migrate deploy
```
Migrations live in `prisma/migrations/`. Never run `prisma migrate dev` against prod. Always add new migrations rather than editing old ones.

### Public asset URLs
Azure Blob containers with `access: "blob"` are public-read; direct URLs work without SAS tokens. SAS token migration is planned (noted in README).

### Required environment variables
- `DATABASE_URL`
- `AZURE_STORAGE_CONNECTION_STRING`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL=https://www.atveanimation.com`
- `FAL_KEY` (NEVER print)
- `REPLICATE_API_TOKEN` (NEVER print)
- `ANTHROPIC_API_KEY` (NEVER print)
- `WEBHOOK_BASE_URL` — for fal/replicate completion callbacks

## 9. Data model

Tables (full schema in `prisma/schema.prisma`):
- `User` — role enum `FREE | SUPER_USER`
- `Character` — `sourcePhotoUrl`, `loraVersion`, `voiceId`, `characterDescription`
- `ProjectCharacter` — join table for multi-character projects
- `Project` — `firstFrameDescription`, legacy `characterId` for single-char projects
- `Scene` — `focusCharacterId` (nullable), `speakerCharacterId` (nullable), `phase`
- `Voice` — auto-matched per character
- `Prediction` — prefix-encoded ID:
  - `fal:` → fal-ai/flux-lora (LoRA-based image gen)
  - `falmk:` → fal-ai/flux-pro/kontext/multi (Multi-Kontext)
  - no prefix → Replicate

Recent migrations:
- `20260622152630_add_lip_sync_prediction_id`
- `20260622214516_add_project_characters_and_scene_focus`
- `20260622224951_add_project_character_relation`
- `20260624015152_add_project_first_frame_description`
- `20260625000320_add_scene_speaker_character_id`

Scene phases: `image → video → lipsync → done` (or `failed`).

## 10. The pipelines

### Personal video flow (the current consumer product)
1. **Photo upload** → `POST /api/characters`
   - EXIF normalize via `sharp(buffer).rotate().jpeg({quality:92}).toBuffer()` — CRITICAL for iPhone selfies
   - Sonnet describe via `describeCharacter()` (culture-neutral prompt)
   - Save Character row
2. **Style transfer** — 4 cartoon options at $0.04 each ($0.16 total)
3. **User picks style** → `POST /api/characters/[id]/augment`
   - 20 style-anchored + 15 source-anchored = 35 augmentations (batched in groups of 5)
   - Plus 5× source photo copies = 40 training images in zip
   - `maxDuration = 540`
4. **LoRA train** via `fal-ai/flux-lora-fast-training` ($0.40)
5. **Project creation** — up to 4 characters
6. **Brief generation** (Haiku) → scenes with `focusCharacterId` + `speakerCharacterId`
7. **Scene generation** — three-path routing (see below)
8. **WAN i2v** on first frame → ~6s video
9. **Kokoro TTS** on voice script
10. **LatentSync lip sync** (single-character scenes only)
11. **ffmpeg concat** with audio-aware trim
12. Final MP4 uploaded to blob

### Three-path scene generation
File: `app/api/scenes/[id]/generate/route.ts`

```ts
const isSharedScene = scene.focusCharacterId === null && projectCharIds.length > 1
```

**Critical:** `isSharedScene` MUST use `=== null`, not `??` fallback. The original bug was `focusCharId = scene.focusCharacterId ?? project.characterId` which made `focusCharId` always truthy and the Multi-Kontext branch unreachable.

Routes:
- `isSharedScene` → `fal-ai/flux-pro/kontext/multi` (prediction prefix `falmk:`) with explicit cast prompt + anti-duplication clause
- `anchorScene?.imageUrl` (scene index > 0) → `flux-kontext-pro` anchored to scene 0's image
- `character?.loraVersion` → `fal-ai/flux-lora` with trigger word (prediction prefix `fal:`)

Auto-retrain fallback: distinguishes "Application not found" (LoRA URL expired → retrain) from generic 404 (endpoint missing → don't retrain). See `lib/training/retrain.ts`.

### Multi-Kontext cast prompt format
```
Cast — render EXACTLY one of each character below. Do NOT duplicate any
character. Do NOT add any extra people:
• Character A (from reference image 1): Kumar — <description>
• Character B (from reference image 2): Kirti — <description>
Scene: ...
CRITICAL constraints: exactly one of each named character...
```

### Defensive backend routing
File: `lib/scene-routing.ts`. Runs on `POST /api/projects/[id]/scenes` regardless of caller — frontend can't be trusted to set `focus_character_id` correctly.

- `detectMultiCharScene(description, charNames)` — name detection in scene description
- `hasRelationalCues(description)` — regex on `they|together|embrace|the couple|approaching figure|looks at her/him`
- `shouldForceShared(description, charNames)` — combines the above; forces `focusCharacterId = null`
- `inferSpeakerCharacterId(voiceScript, projectChars)` — if line addresses character by name, OTHER character is the speaker

### Audio-aware concat
File: `lib/video/concat.ts`. `mergeVideoAudio()` uses:
```
output_t = min(videoDur, audioDur + 0.5)
```
Re-encodes video when trimming (stream-copy can't cut mid-frame). Eliminates the 2-4s dead silence tail that every scene used to have.

### LatentSync skip rule
`focusCharacterId === null` → skip LatentSync, mark phase=`done` immediately. Enforced in BOTH `app/api/webhooks/replicate/route.ts` AND `app/api/webhooks/fal/route.ts`. Reason: LatentSync is single-face only; on multi-character frames it produces "lips move but no audio" glitches.

### Per-character voice attribution
1. Auto-match voice from style image (gender heuristic + Voice catalog lookup) at character creation
2. Scene save endpoint accepts `speaker_name` OR `speaker_character_id` from caller
3. Falls back to `inferSpeakerCharacterId(voice_script)` heuristic
4. Final fallback: `project.characterId` (legacy single-char)

### Identity preservation playbook
Iterated through V1-V11 test runs. Lessons:
- **Sonnet > Haiku** for identity-critical vision ($0.015 vs $0.001 — worth it)
- **EXIF normalize BEFORE any AI call** — iPhone selfies have orientation=6
- **Source photo MUST be in training zip** (5× copies, not just augmentations)
- **Augmentation set quality > training step count**
- **Culture-neutral describe prompts** — do NOT enumerate cultural markings (bindi/sindoor/tilak/mangalsutra triggered hallucinations across all characters)
- **Describe features ONLY if visible in the source photo**

Saved as memory `feedback_exif_orientation.md`.

## 11. Pricing model

| Item | Cost |
|---|---:|
| Sonnet vision describe | $0.015 |
| Style transfer (4 options) | $0.16 |
| Augmentation (35 images) | $1.40 |
| LoRA training | $0.40 |
| **Per-character setup total** | **~$2.00** |
| WAN i2v clip (720p, 100 frames = ~6.25s) | $0.50 ($0.40 base + 1.25× multiplier) |
| Kokoro TTS | $0.005 |
| LatentSync | $0.05 |
| **Per-scene cost (LoRA path)** | **~$0.55** |
| Per-scene cost (Multi-Kontext shared) | ~$0.56 |

All-in: **$0.13 / generated second, $0.19 / finished second** (amortized over 5 videos per character). Augmentation : LoRA training ratio = **3.5×** (the dev.to post's surprise stat).

## 12. End-to-end testing

### Test script pattern
Scripts live in `/tmp/atve-e2e-*.js`, NEVER in repo. Use NextAuth CSRF + session cookie flow:
1. `GET /api/auth/csrf` → extract `csrfToken`
2. `POST /api/auth/callback/credentials` with `csrfToken + email + password`
3. Use returned session cookie for all subsequent requests

### Test account pattern
`claudetestagent<N>@atveanimation.test` — increment N for each new run. Promote to SUPER_USER via direct psql update if needed for testing higher tiers.

### Standard E2E timing (from last clean run)
| Step | Seconds |
|---|---:|
| auth | ~2 |
| upload character | ~3-4 each |
| styles generation | ~12 per character |
| select style | instant |
| augment (35 images) | ~75 per character |
| **train LoRA (longest step)** | ~1500 per character |
| create project | ~6 |
| save scene | ~2 each |
| generate scene (image + video + lipsync) | ~70-90 |
| stitch final | ~7 |
| download | ~1 |

Total clean run: ~28 minutes (most of it is LoRA training).

### Verifying output
- `ffmpeg -i final.mp4 -ss N -vframes 1 frame.jpg` → extract frame at second N
- Read `frame.jpg` with Read tool → Sonnet vision verifies character identity, composition
- `ffprobe` → verify duration, audio track presence, channels

### Test failures to watch for
- **zsh nomatch on glob expansion** before node runs → use `find /tmp -maxdepth 1 -name '...' -delete`, NOT `rm /tmp/atve-*`
- **Scene stuck IN_QUEUE for 80+ min** → check fal balance via API (DO NOT print FAL_KEY)
- **TypeScript build error on focus routing** → confirm `scene.focusCharacterId === null` check, not `??` fallback
- **"lips move no audio"** → confirm LatentSync skip rule applied to shared scenes

### Test scripts must exercise frontend logic too
Calling scene-save API directly with computed `focus_character_id` bypasses studio/new detection. Defensive backend routing in `/api/projects/[id]/scenes` handles this (`shouldForceShared()` runs server-side), but tests still need to cover both paths.

## 13. Failure modes encountered (and how they were debugged)

### EXIF orientation 6 (iPhone selfies)
**Symptom:** Kumar's portrait rendered as a reclining woman with long hair through Kontext Pro.
**Cause:** JPEG raw pixels were landscape with EXIF rotation flag; Kontext read raw pixels.
**Fix:** `sharp(buffer).rotate().jpeg({quality:92}).toBuffer()` in upload route.
**Memory:** `feedback_exif_orientation.md`.

### Fal balance exhausted
**Symptom:** All 4 scene image predictions stuck IN_QUEUE for 80+ minutes.
**Debug:** Tested fal directly with key (without printing it). Got `"User is locked. Reason: Exhausted balance."`
**Fix:** User topped up.

### Kokoro response shape mismatch
**Symptom:** Audio missing on every scene.
**Cause:** Code expected `audio_url` / `audio_file.url`. Fal actually returns `audio.url`.
**Fix:** Handle all three shapes (`audio.url ?? audio_url ?? audio_file.url`). Added test `kokoro-response-parsing.test.ts`.

### isSharedScene fallback bug
**Symptom:** Multi-Kontext code never executed, even on obvious multi-character scenes.
**Cause:** `focusCharId = scene.focusCharacterId ?? project.characterId` made `focusCharId` always truthy → `isSharedScene = !focusCharId && ...` always false.
**Fix:** `isSharedScene = scene.focusCharacterId === null && projectCharIds.length > 1`.

### Cultural prompt bias
**Symptom:** Kontext Pro added bindis to Kumar (a man).
**Cause:** `IDENTITY_DIRECTIVE` enumerated "bindi, sindoor, tilak, mangalsutra, jewelry".
**Fix:** Removed enumeration. Describe features only if visible in source.

### Audio trail-off / dead silence
**Symptom:** WAN 6s clip + Kokoro 3s audio = 3s of silent tail per scene.
**Fix:** `lib/video/concat.ts` uses `min(videoDur, audioDur + 0.5)`. Re-encodes (stream-copy can't cut mid-frame).

### Speaker attribution wrong on V11 scene 3
**Symptom:** "Yes!" line played in Kumar's voice when Heather was speaking.
**Cause:** `speakerCharacterId` null → fallback to `project.characterId` (Matt).
**Fix:** `inferSpeakerCharacterId(voiceScript)` heuristic detects address-by-name patterns.

### fal-ai/flux-dev deprecated
**Symptom:** 404 "Application not found".
**Fix:** Switched to `fal-ai/flux-lora`. Hardened auto-retrain trigger to distinguish "endpoint not found" (don't retrain) from "LoRA URL expired" (retrain) via response body inspection.

### LatentSync "lips move but no audio"
**Symptom:** Shared scenes showed lip motion but no audio playback.
**Cause:** LatentSync is single-face only.
**Fix:** Skip when `focusCharacterId === null` in both webhook paths.

### Vitest mocks break after schema changes
Pattern: always update mocks when adding Prisma relations. Common breaks: `voice.findFirst`, `project.characters` relation, fire-and-forget `describeCharacter`/`describeFirstFrame` calls.

## 14. Security and secrets

### Never print
- `FAL_KEY`
- `REPLICATE_API_TOKEN`
- `ANTHROPIC_API_KEY`
- `AZURE_STORAGE_CONNECTION_STRING`
- `NEXTAUTH_SECRET`
- `DATABASE_URL` (contains password)

User has confirmed this multiple times. When debugging external API issues, you CAN read the token from env and use it for direct API calls — just don't print it back in tool output. See `feedback_model_migrations.md` for related guidance.

### PII handling
- `Testing/` folder contains real user photos. Gitignored.
- `Episodes.md` and `nextsteps.md` also gitignored.
- Never commit anything from `Testing/`.

### Rate limits
`lib/rate-limit.ts` — sliding window for auth endpoints. SUPER_USER role bypasses some limits.

## 15. User preferences (from memory)

- **Kumar Krishnanand** (kumar.krishnanand@gmail.com), solo builder.
- **No corporate references** — do NOT mention Amazon or any past employer in public-facing copy.
- **Generic product**, not skewed to Indian aesthetics. "This app will be for everyone."
- **Human-toned writing** for marketing — no em dashes, no formulaic transitions, no arrow bullets.
- **Push back when warranted.** Don't pick silently between interpretations.
- **Get a lawyer when product hits 50 users.** Current terms are AI-written placeholders. Saved as `project_legal_threshold.md`.

## 16. Marketing and launch state

### Dev.to cost teardown post (PUBLISHED)
URL: https://dev.to/kkjcodes/what-it-actually-costs-to-generate-one-ai-cartoon-video-line-by-line-3omh
Thesis: WAN i2v is 66% of bill; augmentation costs 3.5× LoRA training.
**Numbers to keep consistent across all posts:** $0.19/finished sec, $0.13/generated sec, augmentation $1.40 vs LoRA $0.40, reroll rate 10-12%.

### Active comment thread on dev.to
Engaging with commenters on the post. Reply style: acknowledge first, add specific numbers, end with a question that invites follow-up. Stay in the human-toned voice (no em dashes, no formulaic transitions).

### Launch sequence
See `nextsteps.md` (gitignored). Phased: X thread → r/StableDiffusion → HN Show HN → r/SaaS.

### LinkedIn
Demo video at `/tmp/atve-e2e-linkedin-final-v2.mp4` (5.00s, Matt+Heather Eiffel Tower scene, voice line "Paris, finally. After all these years, we actually made it."). Post copy is in conversation history — human-toned, no em dashes, includes the "three weekends of 'wait, why is there still a second Kumar'" anecdote.

## 17. Professional pivot plan

See `advertising.md` at repo root (NOT gitignored — consider adding before commit if it should stay private). B2B fork for realtors / marketing agents / advertisers: own photo becomes the speaker, cartoon does perfect lip sync, slideshow backgrounds.

Phased approach:
- **Phase 1 (week 1-2):** ship on `fal-ai/sync-lipsync` API. $1.56 per 60-sec video.
- **Phase 2 (week 7-9, after 100 paying users):** synthesize cartoon talking-head dataset (~$60), fine-tune Wav2Lip on rented A100 (~$65), total ~$125 to migrate off the paid API. Per-video cost drops to $0.26.
- **Phase 3:** train custom from scratch ($20K+, 6 months) — don't do this unless validated.

Not started — strategic plan only.

## 18. Working style for the next session

### What's been built and shipped
- Multi-character pipeline (up to 4 chars, Multi-Kontext, defensive backend routing)
- Identity preservation iterated V1-V11 (EXIF, Sonnet describe, culture-neutral prompts, source-in-zip)
- Per-character voice attribution (auto-match + speaker inference)
- Audio-aware concat (no more dead silence)
- LatentSync skip for shared scenes
- README rewritten with reviewer feedback applied
- 301+ unit tests passing
- Dev.to post published, LinkedIn demo + post drafted

### What's NOT built yet
- Professional B2B tier (plan in `advertising.md`, no code)
- Subscription billing (Stripe)
- Voice cloning UI exposure (xtts-v2 wired but not in UI)
- SAS token migration for blob URLs (noted in README)
- Custom lip-sync model (Phase 2 of `advertising.md`)

### Commit conventions
- Short present-tense messages
- User prefers single commits over many small ones when refactoring one area
- Always include:
  ```
  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  ```

### When debugging
1. Check the prediction phase first (image / video / lipsync / done / failed)
2. Check prediction ID prefix (`fal:`, `falmk:`, none=Replicate) — routes to different polling logic
3. For stuck queues, suspect fal balance first (check via API without printing token)
4. For "no audio", check Kokoro response shape AND audio-aware trim logic
5. For "wrong character", check EXIF + culture-neutral prompt + LoRA URL expiry
6. For multi-character bugs, check `shouldForceShared` / `inferSpeakerCharacterId`

### Files most likely to need editing
- `app/api/scenes/[id]/generate/route.ts` — three-path routing
- `app/api/scenes/[id]/route.ts` — polling, audio resolution
- `app/api/webhooks/{fal,replicate}/route.ts` — completion handling
- `app/api/characters/route.ts` — upload + EXIF + describe
- `app/api/characters/[id]/augment/route.ts` — 35-image augmentation
- `app/api/projects/[id]/scenes/route.ts` — defensive backend routing
- `lib/scene-routing.ts` — `shouldForceShared`, `inferSpeakerCharacterId`
- `lib/video/concat.ts` — audio-aware trim
- `lib/ai/describe.ts` — Sonnet character describe
- `lib/training/retrain.ts` — auto-retrain on LoRA URL expiry
- `prisma/schema.prisma` — data model
- `app/studio/new/page.tsx` — multi-character picker, scene UI
- `app/page.tsx` — landing page

### Files NOT to touch without explicit ask
- `README.md` — recently rewritten with reviewer feedback
- `nextsteps.md` — gitignored personal launch plan
- `advertising.md` — professional pivot plan
- Existing `prisma/migrations/*` — never edit, only add new ones

### When in doubt
Surface the question. The user prefers being asked to being surprised. Specific questions ("I see X and Y in the config — which one?") beat open-ended ones ("what should I do?").
