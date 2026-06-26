# AtVeAnimation

**Personalized AI cartoon video generation — from a single photo.**

Upload a photo → pick a cartoon style → clone your voice → write scenes with AI → get a fully animated, narrated video. No editing skills. No studio. No waiting list.

**~$0.11 per second of finished video.** Personalized cartoon character, voice clone, and animated scenes — all on a single 2 GB container.

> Built solo. Shipped to production. Running live at [www.atveanimation.com](https://www.atveanimation.com).

---

## What This Actually Does

Most "AI video" tools paste a stock avatar over a slide deck. This is different.

**Step 1 — Identity capture.** A user uploads one photo. EXIF orientation is baked into the pixel data on ingest (iPhone selfies arrive sideways at every downstream model otherwise). Claude Sonnet writes a structured visual description of the person — culture-neutral, only what's actually in the frame. That description is then carried into every prompt for that user.

**Step 2 — Style transfer.** FLUX Kontext Pro transforms the source photo into the user's chosen cartoon style (Pixar 3D, anime, Studio Ghibli, comic book, pencil sketch, watercolor, claymation, chibi). The style runs on the original photo as an edit operation, with the Sonnet description anchoring identity. This is key to preserving the user's actual face while changing aesthetic.

**Step 3 — LoRA training.** 35 augmented variations of the cartoon character (20 pose/expression edits + 15 face-anchored variations generated directly from the source selfie) plus 5 copies of the original photo are zipped and sent to fal.ai's flux-lora-fast-training endpoint. Training takes 10–15 minutes per character. The trained LoRA is mirrored to Azure Blob so URLs never expire on us. Every later scene with that character is generated through this LoRA.

**Step 4 — Voice.** Claude vision reads the cartoon style image and auto-picks a matching Kokoro voice (male or female, neutral accent). Users can override with a recorded 30-second sample (XTTS-v2 on Replicate) if they want their literal voice — but the auto-pick path means no recording step is required to get a video.

**Step 5 — Scene generation.** Each scene routes through one of three paths depending on cast:
1. **Solo scene** — fal-ai/flux-lora with the character's trigger word
2. **Anchor scene** (one focused character, scene > 0) — FLUX Kontext Pro anchored to scene 0's image
3. **Shared scene** (multiple characters in the frame) — fal-ai/flux-pro/kontext/multi with an explicit cast prompt: per-character labels bound to reference images, with an anti-duplication constraint

Once the keyframe is ready, WAN 2.1 I2V (fal.ai) generates a 5-second animated video and Kokoro generates per-character TTS audio in parallel. FFmpeg merges video + audio per scene, with the output clipped to `min(videoDuration, audioDuration + 0.5s)` so short voice lines don't leave dead silence at the tail.

**Step 6 — Final video.** FFmpeg concatenates all scene clips into one downloadable MP4.

---

## Why This Is Hard To Build

### Character consistency across scenes
The biggest unsolved problem in AI video is identity drift — characters look different in every frame. The fix here is non-trivial: every keyframe generation re-injects the user's LoRA weights AND anchors the prompt to the first scene's output. Subsequent scenes are generated as edits of the first, not independent generations. Result: a character that actually looks like the same person across a 5-scene video.

### Multi-character scenes without duplication
Single-LoRA inference can only produce one trained character. When the scene description asks for "Kumar proposes to Kirti," loading Kumar's LoRA renders both subjects as Kumar — the same face fills every slot in the prompt. Multi-Kontext (fal-ai/flux-pro/kontext/multi) takes distinct reference images, but the model needs explicit binding or it picks one reference and renders both subjects from it. The fix is a server-side prompt builder that emits an explicit cast block bound to reference image positions, an anti-duplication clause, and a relational-cue detector that auto-routes scenes containing "they embrace" or "approaching figure" to Multi-Kontext even when no character names appear in the description.

The cast block that hits fal.ai for a 2-character shared scene looks roughly like this:

```
Cast — render EXACTLY one of each character below. Do NOT duplicate any
character. Do NOT add any extra people:
• Character A (from reference image 1): Kumar — Indian man, early 40s,
  medium-warm brown skin, short black wavy hair, wire-rim oval glasses
• Character B (from reference image 2): Kirti — Indian woman, late 20s,
  long dark hair, gold pendant necklace

Scene: <description>

CRITICAL constraints: exactly one of each named character in the cast,
never more. No anonymous extra people. No duplicates of the same character.
```

`image_urls[0]` is bound to Character A, `image_urls[1]` to Character B; ordering comes from `ProjectCharacter.orderIndex` so the binding is deterministic across re-generations. The character descriptions inside each cast line are the Sonnet-generated visual descriptions stored on the `Character` model, so identity features (glasses, hair, skin tone, distinguishing marks) are anchored both in the reference image AND in the text — the model needs both signals to consistently keep two characters apart.

### Identity preservation through the training pipeline
A LoRA learns whatever's in the training zip. If the augmentation step subtly darkens skin tone or adds facial hair, the LoRA learns the drift as identity — and every generated frame has it baked in. The fix is structural: the training set is 35 cartoon variations PLUS 5 copies of the original photo (counterbalancing the cartoon-side darkening), the Sonnet description is culture-neutral (the earlier prompt that enumerated bindi/sindoor/tilak caused Kontext Pro to hallucinate them onto every face, regardless of source), and EXIF orientation is normalized on upload (iPhone selfies with `orientation=6` rendered sideways through Kontext Pro, which consistently misinterpreted them as a reclining female figure with long hair — producing the wrong-gender cartoon from a male source).

### Per-character voice attribution
A multi-character video has alternating speakers. With a single project voice, Kumar's lines and Kirti's lines all play in the same voice — and lip sync (LatentSync) tries to sync the audio to one face, leaving the other character's mouth animating silently from raw WAN motion. The fix: every character gets their own voice (Claude vision auto-picks gender from the style image), the brief LLM tags each scene with a `speaker` field, and the scene-save endpoint resolves speaker name to a character ID server-side. When the caller omits the speaker, a fallback heuristic infers it from the voiceScript text ("Heather, will you marry me?" → Matt is the speaker, since Heather is the one being addressed). LatentSync is skipped entirely on shared scenes — its single-face limitation creates more glitches than it fixes.

### Synchronizing three async ML pipelines
Image generation (Replicate), video synthesis (fal.ai), and TTS (Replicate) all run on separate infrastructure with different APIs, rate limits, and failure modes. The polling engine in `app/api/scenes/[id]/route.ts` fans these out in parallel after the image completes, waits for both video and audio, then stitches them — without blocking the Next.js server thread. A single scene polls across three external systems in one GET handler.

### Audio-video duration alignment
WAN I2V emits 6-second clips. Kokoro generates audio sized to the text — short voice lines like "Yes!" come back at 3 seconds. Padding the video to 6 seconds leaves dead air at the tail of every scene, which compounds across a 4-scene video into 10+ seconds of silent transitions. The FFmpeg pipeline probes both durations and trims each merged scene to `min(videoDuration, audioDuration + 0.5s)` — the half-second buffer gives a visual outro without leaving silence. When audio actually is longer than video (rare, but possible on long narration), the `atempo` filter chain (clamped to [0.5, 2.0] per pass, chained for speeds > 2×) speeds the audio to match. This all runs in-process inside the container using ffmpeg-static binaries — no subprocess spawning, no external service.

### Running FFmpeg in a Turbopack/Next.js standalone bundle
Turbopack rewrites `__dirname` to `/ROOT` in the production bundle. Both `ffmpeg-static` and `ffprobe-static` use `__dirname` to locate their binaries — so they silently resolve to paths that don't exist at runtime. The fix: bypass the package exports entirely and construct binary paths from `process.cwd()` at runtime. Also: `lavfi` (used to generate silence for scenes without audio) is not compiled into the static FFmpeg binary. Replaced with a Node.js PCM WAV writer that generates valid silence without any FFmpeg format dependency.

### Running a 2 GB container without serverless timeouts
Scene generation takes 60–180 seconds per scene. Serverless platforms with short function timeout ceilings can't handle this. Azure Container Apps with `minReplicas: 0` solves this cleanly: scale to zero when idle (zero cost), scale to 3 replicas under load, no request timeout ceiling. Cold start is 5–8 seconds — acceptable for a generate flow where users expect to wait.

### Prompt sanitization for downstream content filters
The internal Claude-based moderation allows cartoon violence and mature themes. fal.ai's content filter does not. Rather than blocking legitimate animated content, a pre-submission rewriter (Claude Haiku, <300ms) rewrites the video prompt — replacing specific trigger words (`rifle` → `energy beam`, `explosion` → `burst of light`) while preserving all story and character context. Zero user-visible impact; zero blocked legitimate generations.

---

## Cost Breakdown

Per scene, per output second of finished video:

| Component | Model | Cost per 5s scene |
|---|---|---|
| Keyframe image (solo / anchor) | FLUX Kontext Pro (Replicate) | ~$0.04 |
| Keyframe image (LoRA) | fal-ai/flux-lora (fal.ai) | ~$0.04 |
| Keyframe image (multi-character) | flux-pro/kontext/multi (fal.ai) | ~$0.05 |
| Video clip | WAN 2.1 I2V 720p (fal.ai) | ~$0.50 |
| Voice narration | Kokoro TTS (fal.ai) | <$0.005 |
| Content moderation + rewriting | Claude Haiku (Anthropic) | <$0.001 |
| **Total per scene** | | **~$0.55** |

Per character (one-time setup):

| Component | Model | Cost |
|---|---|---|
| Character description (vision) | Claude Sonnet 4.6 | ~$0.015 |
| Style transfer (4 cartoon styles) | FLUX Kontext Pro × 4 | ~$0.16 |
| Training augmentation (35 images) | FLUX Kontext Pro × 35 | ~$1.40 |
| LoRA training | flux-lora-fast-training (fal.ai) | ~$0.40 |
| **Total per character** | | **~$2.00** |

**~$0.11 per second of final video output** (~$6.60/min of finished video).

Infrastructure is ~$30–50/month fixed, amortized across users.

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
│  POST /api/characters                → EXIF normalize · Sonnet describe │
│  POST /api/characters/:id/auto-voice → Claude vision · pick Kokoro voice│
│  POST /api/characters/:id/augment    → Flux Kontext Pro × 35 variations │
│  POST /api/characters/:id/train      → fal-ai/flux-lora-fast-training   │
│                                                                          │
│  POST /api/projects/:id/scenes       → server-side routing decisions    │
│       └─ shouldForceShared(desc) · inferSpeakerCharacterId(script)      │
│                                                                          │
│  POST /api/scenes/:id/generate       → routes to one of three paths:    │
│       ├─ solo focus    → fal-ai/flux-lora (single trigger word)         │
│       ├─ anchor scene  → Flux Kontext Pro (anchored to scene 0)         │
│       └─ shared scene  → flux-pro/kontext/multi (cast prompt + binding) │
│                                                                          │
│  GET  /api/scenes/:id  (polling engine)                                 │
│       ├─ image ready  → fal.queue.submit(WAN I2V)                       │
│       │                 fal.subscribe(Kokoro TTS)  ← parallel           │
│       ├─ both ready   → FFmpeg merge (audio-aware trim)                 │
│       └─ done         → Azure Blob → scene complete                     │
│                                                                          │
│  POST /api/projects/:id/stitch       → FFmpeg concat (in-process)       │
│  POST /api/generate-brief            → Claude Haiku (scene writer + speakers) │
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
│ /scenes/     │   │ characters       │     │ flux-pro/kontext/multi    │
│ /voices/     │   │ projects         │     │ flux-lora                 │
│ /projects/   │   │ project_chars    │     │ flux-lora-fast-training   │
│  · loras     │   │ scenes · voices  │     │ wan-i2v · kokoro          │
└──────────────┘   │ jobs             │     │ sonnet-4-6 · haiku-4-5    │
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
| Solo image gen | fal-ai/flux-lora (fal.ai) | LoRA inference at training-host speed; ~10s/image |
| Anchored image gen | FLUX Kontext Pro (Replicate) | Best identity preservation when anchoring to a prior frame |
| Multi-character gen | fal-ai/flux-pro/kontext/multi (fal.ai) | Native multi-reference composition; no LoRA duplication |
| Video gen | WAN 2.1 I2V (fal.ai) | Highest quality image-to-video; illustrated style support |
| TTS (default) | Kokoro (fal.ai) | Preset voices; <$0.005/scene; synchronous via fal.subscribe |
| TTS (custom) | XTTS-v2 (Replicate) | Real voice clone from 30s sample, opt-in |
| LoRA training | fal-ai/flux-lora-fast-training | ~10–15 min per character; LoRAs mirrored to Azure |
| Character description | Claude Sonnet 4.6 | Accurate age + skin tone + features; culture-neutral prompts |
| AI writing | Claude Haiku 4.5 | Brief generation + speaker tagging + moderation + prompt rewriting |
| Video pipeline | fluent-ffmpeg + ffmpeg-static + ffprobe-static | In-process; no subprocess; audio-aware trim, concat, probing |
| UI | Tailwind CSS v4 + Radix UI | Accessible primitives; mobile-first |
| Infra | Azure Container Apps + Bicep | Scale-to-zero; no timeout ceiling; 1-command deploy |

---

## Local Development

**Prerequisites:** Node.js 20+, Docker, API keys from Replicate / fal.ai / Anthropic.

**Stack note:** this runs on Next.js 16 with Turbopack as the bundler (both dev and production builds). Next.js 16 is recent — if you're used to the 14/15 toolchain, expect a few differences: route handlers default to running on the Node runtime (not Edge), the `app/` directory is the only supported router, and Turbopack is the default for `next dev` and `next build`. No special flags are needed for the FFmpeg/ESM modules used here — the in-process ffmpeg calls work under Turbopack as long as binary paths are resolved via `process.cwd()` (see the §"Running FFmpeg in a Turbopack/Next.js standalone bundle" section above for why).

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

Scene generation runs for 60–180 seconds per scene. This rules out serverless platforms with short function timeout ceilings. Azure Container Apps handles long-running HTTP with no configuration changes.

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

| Feature | Limit (FREE) | Limit (SUPER_USER) | Reset |
|---|---|---|---|
| Scene generation | 10 / day | unlimited | Midnight UTC |
| AI brief generation | 20 / day | unlimited | Midnight UTC |
| LoRA training | 10 / day | unlimited | Midnight UTC |
| Account registration | 5 / IP / hour | — | Sliding window |
| Password reset request | 3 / IP / hour | — | Sliding window |

---

## Data Handling

**What is stored:** the user's uploaded photo, a 30-second voice recording, trained LoRA weights (on Replicate's infrastructure), and all generated images, audio, and video clips (on Azure Blob Storage).

**Access model:** every blob is stored at a UUID-keyed path — URLs are unguessable without database access. LoRA weights are stored as private Azure blobs with the same UUID-path scheme; the LoRA URL is passed inline to fal.ai's `flux-lora` endpoint at inference time. The blob container is public-read (no auth layer on URLs themselves); the security model is unguessable paths, which is a known trade-off made so direct URLs can be passed to external ML APIs without a signed-URL redirect step.

**Migration path to private blobs:** the planned hardening is private containers with short-lived Azure SAS tokens — 5-minute expirations, generated server-side at the moment a URL is handed to an external API (fal/Replicate webhook input). The webhook-receiving endpoints would still get a direct URL, but the URL would expire before it could be replayed. The blocker is that some of the external APIs cache input URLs across retries, which would invalidate SAS tokens mid-request; a workable mitigation is to mirror inputs through a 1-hour ttl proxy so the SAS lifetime decouples from the third-party retry window. The architectural blueprint is in place; the migration is sequenced after the next round of identity-preservation work.

**Deletion:** deleting a character removes all associated blobs and database records in one operation — images, clips, audio, and voice sample included.

**Scope:** face and voice data are used solely to generate content for the account that uploaded them. They are not shared, resold, or used for model training.

---

## Contact

**Kumar Jha** — designed and built this end-to-end.

For collaboration, licensing, or if you're building something in the AI video or avatar space:
[kumar.krishnanand@gmail.com](mailto:kumar.krishnanand@gmail.com)
