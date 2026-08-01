import { prisma } from "@/lib/db/client"
import { extractShotPlan } from "@/lib/scrapbook/vision"
import { generateBeforeKeyframe, generateAfterKeyframe } from "@/lib/scrapbook/stylize"
import { generateSubtleClip } from "@/lib/scrapbook/interpolate"
import { submitDynamicClip } from "@/lib/scrapbook/motion"
import { runQcAndFinalize } from "@/lib/scrapbook/finalize"
import { type ShotPlan } from "@/lib/scrapbook/models"
import { COST_ESTIMATES, type ScrapbookStyle } from "@/lib/scrapbook/config"
import { logError } from "@/lib/logger"
import { mapProviderError } from "@/lib/async-work/errors"

// Helper: persist a terminal failure/fallback state with mapped user-safe
// error metadata. Every internal catch in the pipeline uses this so the UI
// never renders a generic "Something went wrong" when specific guidance
// exists (content-policy, timeout, quota, etc.).
async function markTerminal(
  pageId: string,
  data: {
    generationPhase: "done" | "failed"
    usedFallback?: boolean
    reason: string
    error: unknown
  },
): Promise<void> {
  const mapped = mapProviderError(data.error)
  await prisma.scrapbookPage.update({
    where: { id: pageId },
    data: {
      generationPhase: data.generationPhase,
      generationStartedAt: null,
      generationFailureCode: mapped.code,
      generationFailureMessage: mapped.message,
      ...(data.usedFallback !== undefined && {
        usedFallback: data.usedFallback,
        qcResult: { passed: false, reason: data.reason, metrics: {} } as unknown as object,
      }),
    },
  })
}

// Orchestrator: runs the scrapbook pipeline for ONE page.
//
// Design rule (per Python spec): a page can fail (falls back to Ken Burns);
// the JOB only fails if every stage of every page fails or assembly fails.
//
// Stage phases persist to Scene.generationPhase so the UI can render progress:
//   vision → before → after → motion → qc → done | failed
//
// For the SUBTLE route we complete synchronously (RIFE is cheap enough to
// block on). For the DYNAMIC route we submit the WAN FLF2V request and the
// fal webhook takes over — the page sits at phase="motion" until then.

async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; mime: "image/jpeg" | "image/png" | "image/gif" | "image/webp" }> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch photo (${res.status}): ${url}`)
  const mimeRaw = res.headers.get("content-type") ?? "image/jpeg"
  const mime = (mimeRaw.split(";")[0].trim().toLowerCase()) as "image/jpeg" | "image/png" | "image/gif" | "image/webp"
  return { buffer: Buffer.from(await res.arrayBuffer()), mime: mime.startsWith("image/") ? mime : "image/jpeg" }
}

// Run one page through vision → stylize → route → (subtle: interp+QC / dynamic: submit).
// The page row is updated at every phase transition so the UI can show progress.
export async function runPagePipeline(pageId: string): Promise<void> {
  const page = await prisma.scrapbookPage.findUnique({
    where: { id: pageId },
    include: { project: { select: { id: true, userId: true, style: true } } },
  })
  if (!page) throw new Error(`Page not found: ${pageId}`)
  const style = page.project.style as ScrapbookStyle
  const projectId = page.project.id
  const pageIndex = page.orderIndex

  let costAccum = 0

  // ── Phase 1: vision (Sonnet shot plan) ────────────────────────────────────
  await prisma.scrapbookPage.update({ where: { id: pageId }, data: { generationPhase: "vision" } })
  let plan: ShotPlan
  try {
    const { buffer, mime } = await fetchImageBuffer(page.sourcePhotoUrl)
    plan = await extractShotPlan(buffer, mime, style)
    costAccum += COST_ESTIMATES.vision
    await prisma.scrapbookPage.update({
      where: { id: pageId },
      data: {
        shotPlan: plan as unknown as object,
        caption: plan.caption,
        route: plan.motion_class,
        costUsd: costAccum,
      },
    })
  } catch (e) {
    logError("/scrapbook/pipeline", "vision", { pageId, userId: page.project.userId }, e)
    await markTerminal(pageId, { generationPhase: "failed", reason: "vision failed", error: e })
    return
  }

  // ── Phase 2a: before keyframe ─────────────────────────────────────────────
  await prisma.scrapbookPage.update({ where: { id: pageId }, data: { generationPhase: "before" } })
  let beforeUrl: string
  try {
    beforeUrl = await generateBeforeKeyframe(page.sourcePhotoUrl, plan, style, projectId, pageIndex)
    costAccum += COST_ESTIMATES.fluxImg2Img
    await prisma.scrapbookPage.update({
      where: { id: pageId },
      data: { beforeKeyframeUrl: beforeUrl, costUsd: costAccum },
    })
  } catch (e) {
    // No before keyframe → we can Ken Burns on the RAW photo. Terminal
    // "done" with fallback; assembler picks up sourcePhotoUrl as the still.
    logError("/scrapbook/pipeline", "before_keyframe", { pageId, userId: page.project.userId }, e)
    await markTerminal(pageId, {
      generationPhase: "done",
      usedFallback: true,
      reason: "before keyframe failed",
      error: e,
    })
    return
  }

  // ── Phase 2b: after keyframe ──────────────────────────────────────────────
  await prisma.scrapbookPage.update({ where: { id: pageId }, data: { generationPhase: "after" } })
  let afterUrl: string
  try {
    afterUrl = await generateAfterKeyframe(beforeUrl, plan, style, projectId, pageIndex)
    costAccum += COST_ESTIMATES.fluxKontext
    await prisma.scrapbookPage.update({
      where: { id: pageId },
      data: { afterKeyframeUrl: afterUrl, costUsd: costAccum },
    })
  } catch (e) {
    // Have before keyframe → Ken Burns fallback on it.
    logError("/scrapbook/pipeline", "after_keyframe", { pageId, userId: page.project.userId }, e)
    await markTerminal(pageId, {
      generationPhase: "done",
      usedFallback: true,
      reason: "after keyframe failed",
      error: e,
    })
    return
  }

  // ── Phase 3: motion (routed) ──────────────────────────────────────────────
  await prisma.scrapbookPage.update({ where: { id: pageId }, data: { generationPhase: "motion" } })

  if (plan.motion_class === "subtle") {
    // Subtle route: RIFE synchronously, then QC in-process.
    try {
      const rawClipUrl = await generateSubtleClip(beforeUrl, afterUrl, projectId, pageIndex)
      costAccum += COST_ESTIMATES.rife
      await prisma.scrapbookPage.update({
        where: { id: pageId },
        data: { rawClipUrl, costUsd: costAccum, generationPhase: "qc" },
      })
      await runQcAndFinalize(pageId, rawClipUrl, beforeUrl)
    } catch (e) {
      logError("/scrapbook/pipeline", "subtle_motion", { pageId, userId: page.project.userId }, e)
      await markTerminal(pageId, {
        generationPhase: "done",
        usedFallback: true,
        reason: "subtle motion generation failed",
        error: e,
      })
    }
    return
  }

  // Dynamic route: submit WAN FLF2V and hand off to fal webhook.
  try {
    const { predictionId } = await submitDynamicClip(beforeUrl, afterUrl, plan)
    costAccum += COST_ESTIMATES.wanFlf2v // reservation; may adjust on real fal pricing
    await prisma.scrapbookPage.update({
      where: { id: pageId },
      data: {
        motionPredictionId: predictionId,
        costUsd: costAccum,
        // Stay at phase "motion" — fal webhook advances to "qc" → "done"
      },
    })
  } catch (e) {
    logError("/scrapbook/pipeline", "dynamic_submit", { pageId, userId: page.project.userId }, e)
    await markTerminal(pageId, {
      generationPhase: "done",
      usedFallback: true,
      reason: "WAN FLF2V submit failed",
      error: e,
    })
  }
}

// runQcAndFinalize is re-exported from lib/scrapbook/finalize.ts (which the
// fal webhook imports directly, avoiding this file's Anthropic transitive dep).
