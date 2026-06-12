# AtVeAnimation

**Personalized AI cartoon video generation — from a single photo.**

Upload a photo → pick a cartoon style → clone your voice → write scenes with AI → get a fully animated, narrated video. No editing skills. No studio. No waiting list.

**~$0.11 per second of finished video.** Synthesia charges $3–8/min for generic talking heads. HeyGen's custom avatar tier starts at $120/month. This produces a more personalized product at a fraction of the cost — and runs on a single 2 GB container.

> Built solo. Shipped to production. Running live at [atveanimation.com](https://atveanimation.com).

---

## What This Actually Does

Most "AI video" tools paste a stock avatar over a slide deck. This is different.

**Step 1 — Identity training.** A user uploads one photo. The system fine-tunes a Flux LoRA adapter specifically on their face — trained on Replicate's H100 fleet, weights stored privately per user. Every subsequent image generated for that user uses their personal LoRA, so their character looks like *them* across every scene.

**Step 2 — Style transfer.** FLUX Kontext Pro transforms the LoRA-anchored portrait into any cartoon style (Pixar 3D, anime, comic book, pencil sketch). The style runs on the original photo as an edit operation, not a generation from scratch — this is key to preserving identity while changing aesthetic.

**Step 3 — Voice cloning.** The user records 30 seconds of speech in the browser via the Web MediaRecorder API. XTTS-v2 on Replicate trains a speaker embedding from that recording. All narration is then synthesized in the user's actual voice.

**Step 4 — Scene generation.** Each scene goes through a four-stage async pipeline:
1. Flux Kontext Pro → 1280×720 keyframe anchored to the character's LoRA
2. WAN 2.1 I2V (fal.ai) → 5/10/15-second animated video clip from the keyframe
3. XTTS-v2 → voice-cloned narration audio
4. FFmpeg → audio-video merge with atempo speed correction, then Azure Blob upload

**Step 5 — Final video.** FFmpeg concatenates all scene clips into one downloadable MP4.

---

## Why This Is Hard To Build

### Character consistency across scenes
The biggest unsolved problem in AI video is identity drift — characters look different in every frame. The fix here is non-trivial: every keyframe generation re-injects the user's LoRA weights AND anchors the prompt to the first scene's output. Subsequent scenes are generated as edits of the first, not independent generations. Result: a character that actually looks like the same person across a 5-scene video.

### Synchronizing three async ML pipelines
Image generation (Replicate), video synthesis (fal.ai), and TTS (Replicate) all run on separate infrastructure with different APIs, rate limits, and failure modes. The polling engine in `app/api/scenes/[id]/route.ts` fans these out in parallel after the image completes, waits for both video and audio, then stitches them — without blocking the Next.js server thread. A single scene polls across three external systems in one GET handler.

### Audio-video duration alignment
WAN I2V generates video to an approximate target duration. XTTS-v2 generates audio based on text length. These almost never match. The FFmpeg pipeline probes both durations and applies an `atempo` filter chain (clamped to [0.5, 2.0] per pass, chained for speeds > 2×) to speed the audio to match the video. This runs in-process inside the container using ffmpeg-static binaries — no subprocess spawning, no external service.

### Running FFmpeg in a Turbopack/Next.js standalone bundle
Turbopack rewrites `__dirname` to `/ROOT` in the production bundle. Both `ffmpeg-static` and `ffprobe-static` use `__dirname` to locate their binaries — so they silently resolve to paths that don't exist at runtime. The fix: bypass the package exports entirely and construct binary paths from `process.cwd()` at runtime. Also: `lavfi` (used to generate silence for scenes without audio) is not compiled into the static FFmpeg binary. Replaced with a Node.js PCM WAV writer that generates valid silence without any FFmpeg format dependency.

### Running a 2 GB container without serverless timeouts
Scene generation takes 60–180 seconds per scene. No serverless platform can handle this — Vercel times out at 60s on the free tier, Lambda caps at 15 minutes with painful cold starts. Azure Container Apps with `minReplicas: 0` solves this cleanly: scale to zero when idle (zero cost), scale to 3 replicas under load, no request timeout ceiling. Cold start is 5–8 seconds — acceptable for a generate flow where users expect to wait.

### Prompt sanitization for downstream content filters
The internal Claude-based moderation allows cartoon violence and mature themes. fal.ai's content filter does not. Rather than blocking legitimate animated content, a pre-submission rewriter (Claude Haiku, <300ms) rewrites the video prompt — replacing specific trigger words (`rifle` → `energy beam`, `explosion` → `burst of light`) while preserving all story and character context. Zero user-visible impact; zero blocked legitimate generations.

---

## Cost Breakdown

Per scene, per output second of finished video:

| Component | Model | Cost per 5s scene |
|---|---|---|
| Keyframe image | FLUX Kontext Pro (Replicate) | ~$0.04 |
| Video clip | WAN 2.1 I2V 720p (fal.ai) | ~$0.50 |
| Voice narration | XTTS-v2 (Replicate) | ~$0.01 |
| Content moderation + rewriting | Claude Haiku (Anthropic) | <$0.001 |
| **Total per scene** | | **~$0.55** |

**~$0.11 per second of final video output.**

### vs. The Competition

These figures are directional and time-bound (June 2026) — exact rates shift, but the order-of-magnitude gap is structural.

| Product | What you get | Cost per minute of video |
|---|---|---|
| **AtVeAnimation** | Personalized cartoon character + voice clone + animated scenes | **~$6.60** |
| Synthesia | Generic stock avatar, no style customization | $30–120 |
| HeyGen custom avatar | Photo-realistic talking head, no cartoon | Starts at $120/mo plan |
| Runway Gen-3 | Video generation only, no character consistency | ~$12–24 |
| D-ID | Talking portrait, no style transfer | ~$18 |

AtVeAnimation is the only product in this comparison that does LoRA-based identity preservation, cross-scene character consistency, and voice cloning together — at any price point. The gap closes further at scale: infrastructure is ~$30–50/month fixed, amortized across users.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Browser                                        │
│                                                                          │
│  ┌──────────┐  ┌─────────────────┐  ┌──────────────────────────────┐   │
│  │  Photo   │  │  Mic Recording  │  │  Scene Editor / Video Player │   │
│  │  Upload  │  │ (MediaRecorder) │  │  (Next.js, Tailwind, Radix)  │   │
│  └────┬─────┘  └────────┬────────┘  └─────────────┬────────────────┘   │
└───────┼─────────────────┼───────────────────────────┼────────────────────┘
        │                 │                           │ polling (5s)
        ▼                 ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────┐
│           Next.js 16 App Router — Azure Container Apps                   │
│           1 vCPU / 2 GiB RAM  ·  minReplicas: 0  ·  maxReplicas: 3      │
│                                                                          │
│  POST /api/characters/:id/train      → Flux LoRA trainer (Replicate)    │
│  POST /api/characters/:id/augment    → Flux Kontext Pro (style xfer)    │
│  POST /api/scenes/:id/generate       → Flux Kontext Pro (scene frame)   │
│                                                                          │
│  GET  /api/scenes/:id  (polling engine)                                 │
│       ├─ image ready  → fal.queue.submit(WAN I2V)                       │
│       │                 replicate.create(XTTS-v2)  ← parallel           │
│       ├─ both ready   → FFmpeg merge (in-process, atempo sync)          │
│       └─ done         → Azure Blob → scene complete                     │
│                                                                          │
│  POST /api/projects/:id/stitch       → FFmpeg concat (in-process)       │
│  POST /api/generate-brief            → Claude Haiku (scene writer)      │
│  POST /api/voice/transcribe          → Whisper (Replicate)              │
│                                                                          │
│  ┌─────────────┐  ┌───────────────┐  ┌──────────────────────────────┐  │
│  │  NextAuth   │  │  Prisma ORM   │  │  fluent-ffmpeg (in-process)  │  │
│  │  JWT/creds  │  │  Postgres 16  │  │  atempo · concat · probe     │  │
│  └─────────────┘  └───────────────┘  └──────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
         │                    │                         │
         ▼                    ▼                         ▼
┌──────────────┐   ┌─────────────────┐     ┌───────────────────────────┐
│ Azure Blob   │   │ Azure PostgreSQL │     │ Replicate · fal.ai        │
│ Storage      │   │ Flexible Server  │     │ Anthropic                 │
│              │   │                  │     │                           │
│ /characters/ │   │ users            │     │ flux-kontext-pro          │
│ /scenes/     │   │ characters       │     │ flux-dev-lora-trainer     │
│ /voices/     │   │ projects         │     │ wan-2.1-i2v               │
│ /projects/   │   │ scenes           │     │ xtts-v2                   │
└──────────────┘   │ voices · jobs    │     │ claude-haiku-4-5          │
                   └─────────────────┘     └───────────────────────────┘
```

### Scene Generation Pipeline (detailed)

```
POST /api/scenes/:id/generate
  │
  │  1. Claude Haiku: moderate scene description (fails open)
  │  2. Fetch character LoRA weights URL from DB
  │  3. Flux Kontext Pro: generate 1280×720 keyframe
  │     └─ injects LoRA weights + trigger word + style hints
  ▼
GET /api/scenes/:id  (client polls every 5s)
  │
  ├─ phase: "image" — Replicate prediction in flight
  │    │
  │    │  on success → parallel fan-out:
  │    │  ┌─────────────────────────────────────────┐
  │    │  │  fal.queue.submit(wan-i2v)              │
  │    │  │    prompt: sanitizeVideoPrompt(...)      │  ← Claude rewrites
  │    │  │    image_url: keyframe                  │     trigger words
  │    │  │    resolution: 720p                     │
  │    │  │                                         │
  │    │  │  replicate.create(xtts-v2)              │
  │    │  │    text: voiceScript                    │
  │    │  │    speaker: voice sample (base64 URI)   │
  │    │  │                                         │
  │    │  │  mirrorUrlToBlob(keyframe → Azure)      │
  │    │  └─────────────────────────────────────────┘
  │    └─ db: phase → "video", store request IDs
  │
  ├─ phase: "video" — WAN + XTTS both in flight
  │    │
  │    │  on both complete:
  │    │  1. probeDuration(video) + probeDuration(audio)
  │    │  2. if audioDur > videoDur × 1.05:
  │    │       speed = min(audioDur / videoDur, 4.0)
  │    │       atempo filter chain (chained passes for speed > 2×)
  │    │  3. if no audio: write silent PCM WAV in Node (no lavfi needed)
  │    │  4. FFmpeg merge → /tmp/session_m{i}.mp4
  │    │  5. mirrorUrlToBlob → Azure Blob
  │    └─ db: phase → "done", videoClipUrl written
  │
  └─ phase: "done" → client stops polling, scene card updates
```

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js 16, App Router, standalone output | Long-running API routes; no serverless timeout |
| Auth | NextAuth v4, credentials + JWT | Stateless; no Redis dependency |
| Database | PostgreSQL 16, Prisma 7 | Relational graph across character / project / scene |
| Storage | Azure Blob (public container) | CDN-served; direct URLs usable as ML API inputs |
| Image gen | FLUX Kontext Pro (Replicate) | Best identity preservation with LoRA injection |
| Video gen | WAN 2.1 I2V (fal.ai) | Highest quality image-to-video; illustrated style support |
| Voice cloning | XTTS-v2 (Replicate) | Open-weight; real voice clone from 30s sample |
| LoRA training | flux-dev-lora-trainer (Replicate) | H100 fleet; ~20 min per character |
| AI writing | Claude Haiku 4.5 | Fast, cheap; brief generation + moderation + prompt rewriting |
| Video pipeline | fluent-ffmpeg + ffmpeg-static + ffprobe-static | In-process; no subprocess; atempo, concat, probing |
| UI | Tailwind CSS v4 + Radix UI | Accessible primitives; mobile-first |
| Infra | Azure Container Apps + Bicep | Scale-to-zero; no timeout ceiling; 1-command deploy |

---

## Local Development

**Prerequisites:** Node.js 20+, Docker, API keys from Replicate / fal.ai / Anthropic.

```bash
git clone https://github.com/yourusername/atveanimation.git
cd atveanimation
npm install

cp .env.local.example .env.local
# fill in: REPLICATE_API_TOKEN, ANTHROPIC_API_KEY, FAL_KEY

docker compose up -d          # Postgres + Azurite blob storage
npx prisma migrate dev
npm run dev                   # http://localhost:3000
```

### Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Blob / Azurite for local |
| `AZURE_STORAGE_CONTAINER_NAME` | Blob container name (`atveanimation`) |
| `NEXTAUTH_SECRET` | JWT signing secret (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | App base URL |
| `NEXT_PUBLIC_APP_URL` | Same as NEXTAUTH_URL (used client-side) |
| `REPLICATE_API_TOKEN` | replicate.com |
| `ANTHROPIC_API_KEY` | console.anthropic.com |
| `FAL_KEY` | fal.ai |

---

## Deploy to Production

Scene generation runs for 60–180 seconds per scene. This rules out Vercel, Netlify, Lambda, and any platform with sub-60s function timeouts. Azure Container Apps handles long-running HTTP with no configuration changes.

**Provisioned on first deploy:**
- Azure Container Registry — Docker image storage
- Container App — Next.js server (1 vCPU / 2 GiB, scale-to-zero)
- PostgreSQL Flexible Server B1ms — database
- Azure Storage Account — blob storage for all assets
- Log Analytics Workspace — structured logs

**Estimated infrastructure cost: ~$30–50/month at low traffic.**

### One-Command Deploy

```bash
./deploy.sh
```

Provisions all Azure infrastructure, builds the multi-stage Docker image (`--platform linux/amd64`), pushes to ACR, and deploys. ~10 minutes first run, ~5 minutes for code-only redeploys.

### Incremental Deploy (code changes only)

```bash
ACR_SERVER="atveanimationprodacr.azurecr.io"

docker build \
  --platform linux/amd64 \
  --build-arg NEXT_PUBLIC_APP_URL="https://www.atveanimation.com" \
  -t "${ACR_SERVER}/atveanimation:latest" .

az acr login --name atveanimationprodacr
docker push "${ACR_SERVER}/atveanimation:latest"

az containerapp update \
  --name atveanimation \
  --resource-group atveanimation-prod-rg \
  --image "${ACR_SERVER}/atveanimation:latest" \
  --revision-suffix "v$(date +%s)"
```

---

## Rate Limits

Enforced per-user via the `jobs` table — no Redis, no external rate-limit service needed.

| Feature | Limit | Reset |
|---|---|---|
| Scene generation | 10 / day | Midnight UTC |
| AI brief generation | 20 / day | Midnight UTC |
| LoRA training | 3 lifetime | Never |

---

## Data Handling

**What is stored:** the user's uploaded photo, a 30-second voice recording, trained LoRA weights (on Replicate's infrastructure), and all generated images, audio, and video clips (on Azure Blob Storage).

**Access model:** every blob is stored at a UUID-keyed path — URLs are unguessable without database access. LoRA weights are private to the Replicate account. The blob container is public-read (no auth layer on URLs themselves); the security model is unguessable paths, which is a known trade-off made so direct URLs can be passed to external ML APIs without a signed-URL redirect step. Migrating to private container + SAS URLs is tracked as future work.

**Deletion:** deleting a character removes all associated blobs and database records in one operation — images, clips, audio, and voice sample included.

**Scope:** face and voice data are used solely to generate content for the account that uploaded them. They are not shared, resold, or used for model training.

---

## Contact

**Kumar Jha** — designed and built this end-to-end.

For collaboration, licensing, or if you're building something in the AI video or avatar space:
[kumar.krishnanand@gmail.com](mailto:kumar.krishnanand@gmail.com)
