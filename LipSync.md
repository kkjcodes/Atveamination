# Lip Sync — Custom Model Plan

## Problem

WAN 2.1 I2V generates "natural" cinematic motion from a still image. It has no knowledge of the audio — the character's mouth moves based on what looks plausible for the scene, not what is being said. The result is lip movement that is visibly out of sync with the cloned voice.

This is architectural, not a tuning issue. A separate audio-driven lip sync step is required.

---

## Why Existing Models Don't Work

Off-the-shelf lip sync models (Wav2Lip, MuseTalk, SadTalker) are trained on realistic human faces. They fail on cartoon outputs for two reasons:

1. **Training distribution mismatch** — cartoon faces have different geometry, exaggerated features, and stylized mouth regions that these models have never seen.
2. **Wav2Lip's pixel-space discriminator** — Wav2Lip operates directly on pixel values. Its GAN discriminator blurs and introduces blocky artifacts around the mouth region. On clean cartoon geometry — flat color regions, sharp lines — this stands out immediately and looks worse than no lip sync at all.

---

## Base Model: LatentSync

**LatentSync** (ByteDance, 2024) is the right foundation.

- Operates in the latent space of Stable Diffusion rather than pixel space
- The diffusion prior has learned to maintain geometric coherence and stylized texture — it does not blend a synthetic mouth region into a cartoon face at the pixel level
- Handles cartoon/stylized inputs far better than pixel-space discriminators
- State of the art on realistic faces; the latent space approach generalizes better to stylized inputs after fine-tuning

GitHub: `BytedanceResearch/LatentSync`

---

## Data Strategy: Synthetic Dataset via Own Pipeline

Training data cannot come from copyrighted animated shows. But the existing FLUX Kontext Pro style transfer pipeline can generate it.

**Approach:**
1. Download LRS2 or LRS3 — public research datasets of realistic talking heads (~28k videos) with ground truth audio and lip sync labels
2. Run each face through FLUX Kontext Pro with a cartoon style (the same styles used in production)
3. Keep the original audio and lip labels
4. Result: cartoon faces + ground truth audio + lip sync annotations — entirely synthetic, no copyright issues

This works because the audio-to-phoneme mapping is universal. Only the visual rendering of mouth shapes needs to be learned for the cartoon domain. The style transfer step bridges that gap.

**Note:** dataset generation calls the Replicate API and runs regardless of local hardware.

---

## Training Plan

### Phase 1 — Validate (2-4 weeks, ~$150-400)

Goal: confirm that LatentSync fine-tuned on cartoon data produces usable lip sync on actual pipeline outputs. Go/no-go before committing to Phase 2.

1. Set up LatentSync training environment locally on M5 Mac
2. Generate 2-3 hours of synthetic cartoon training data (LRS2 → style transfer)
3. Debug the training loop on M5 Mac — smoke test to confirm gradients flow (hours, no cloud cost)
4. Run actual fine-tuning on RunPod (1-2x A100 80GB, 2-4 days)
5. Test output on real pipeline scenes — evaluate artifact level and sync quality
6. Decision point: quality acceptable → proceed to Phase 2

### Phase 2 — Production Model (4-8 weeks, ~$400-1200)

1. Scale synthetic dataset to 10-20 hours of cartoon talking head video
2. Fine-tune LatentSync on the larger dataset (2-4x A100 80GB, 3-6 days)
3. Package as a Replicate custom model deployment (fits existing stack)
4. Wire into scene pipeline as a post-processing step: after WAN I2V, before FFmpeg merge
5. Validate identity preservation — confirm LoRA-anchored likeness survives the lip sync pass

---

## Pipeline Integration Point

Current scene pipeline:
```
Flux Kontext Pro → keyframe
WAN 2.1 I2V    → animated clip
XTTS-v2        → voice audio
FFmpeg         → merge
```

With lip sync:
```
Flux Kontext Pro  → keyframe
WAN 2.1 I2V      → animated clip
XTTS-v2          → voice audio
LatentSync        → lip sync pass (animated clip + audio → synced clip)
FFmpeg            → merge
```

---

## Hardware

### M5 Max (36GB unified memory) — local

| Task | Feasibility |
|---|---|
| Environment setup | Yes |
| Data preprocessing | Yes — fast, CPU-bound |
| Training loop debug / smoke test | Yes — hours |
| Full fine-tuning | No — too slow (weeks) |
| Inference once trained | Yes — ~15-30s per 5s clip, acceptable |

The M5 Max is the right machine for development iteration. The diffusion model size makes it impractical as the primary training machine.

### Cloud — RunPod A100 80GB (~$2.50-3/hr)

| Run | Duration | Cost |
|---|---|---|
| Phase 1 fine-tune | 2-4 days | $150-400 |
| Phase 2 production | 3-6 days | $400-1200 |

Workflow: develop and debug on Mac (no hourly cost), kick off training runs on RunPod.

---

## Cost Summary

| Item | Cost |
|---|---|
| Dataset generation (style transfer on LRS2 via Replicate) | $100-300 |
| Phase 1 training (RunPod) | $150-400 |
| Phase 2 training (RunPod) | $400-1200 |
| **Total to production** | **$700-2500** |

Inference cost per scene once deployed: ~$0.05-0.15 for a 5-second clip on Replicate.

---

## Risks

**Style variance** — a model fine-tuned on one cartoon style (e.g. Pixar 3D) may not generalize to others (anime, pencil sketch). Either train on multiple styles from the start, or pick one canonical style for v1.

**Identity bleed** — the lip sync pass touches the face/mouth region and could partially undo the LoRA-anchored character likeness. Test this in Phase 1 before committing to Phase 2.

**Data quality ceiling** — the synthetic dataset inherits style transfer artifacts. The model will learn to work within them, but it sets a ceiling on quality.

**Resolution mismatch** — LatentSync's mouth region crop and warp step may need adjustment for cartoon proportions and the 1280×720 keyframe resolution. Verify this early in Phase 1 setup.

---

## Open Questions (resolve in Phase 1)

- Does LatentSync's input resolution handling conflict with 1280×720 cartoon outputs?
- Which cartoon styles to include in the training dataset — all styles or one canonical style for v1?
- Does identity (LoRA likeness) survive the lip sync pass at acceptable quality?
- What is the minimum dataset size for acceptable generalization across different users' cartoon faces?
