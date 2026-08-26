import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { tmpdir } from "os"
import { join } from "path"
import { publicPath } from "@/lib/paths"
import { renderAd, downloadAssetsToLocal } from "@/lib/business/render"
import { isPresenterEligibleStyle } from "@/lib/business/presenter"
import type { AdScript } from "@/lib/business/adscript-schema"
import { emit } from "@/lib/events"
import { checkBusinessRenderLimit, killSwitchEngaged } from "@/lib/limits"
import { claimAsyncWork, STALE_WINDOWS } from "@/lib/async-work/claim"
import { fireAndForget } from "@/lib/async-work/fire"

// Fire-and-forget render via the shared async-work primitives. Renders take
// 60-120s in practice and would 524 through Cloudflare if sync. Returns 202
// immediately; the client polls GET /api/business/ads/[id] to see the
// status transition to "ready" or "failed".
export const maxDuration = 30

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: adId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const kill = await killSwitchEngaged()
  if (kill.engaged) {
    void emit("kill_switch_tripped", { route: "render", reason: kill.reason })
    return NextResponse.json({ error: "Rendering is temporarily paused — try again shortly." }, { status: 503 })
  }

  const limit = await checkBusinessRenderLimit(userId, session.user.role)
  if (!limit.allowed) {
    void emit("quota_reached", { segment: "business", used: limit.used, limit: limit.limit }, userId)
    return NextResponse.json(
      { error: "Monthly render quota reached.", used: limit.used, limit: limit.limit, resetsAt: limit.resetsAt },
      { status: 429 },
    )
  }

  const ad = await prisma.ad.findFirst({
    where: { id: adId, business: { userId } },
    include: {
      business: { select: { id: true, userId: true, logoAssetId: true, phone: true, website: true } },
    },
  })
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 })
  if (!ad.adScript) return NextResponse.json({ error: "Ad has no script yet — generate one first" }, { status: 400 })

  const script = ad.adScript as unknown as AdScript

  const assetIds = new Set<string>()
  for (const scene of script.scenes) {
    if (scene.type !== "end_card" && scene.asset_id) assetIds.add(scene.asset_id)
    if (scene.type === "end_card" && scene.logo_asset_id) assetIds.add(scene.logo_asset_id)
  }
  if (ad.business.logoAssetId) assetIds.add(ad.business.logoAssetId)

  const assetRows = await prisma.asset.findMany({
    where: { id: { in: Array.from(assetIds) }, userId },
  })
  const urlsByAssetId = new Map(assetRows.map((a) => [a.id, a.url]))
  const missing = Array.from(assetIds).filter((id) => !urlsByAssetId.has(id))
  if (missing.length > 0) {
    return NextResponse.json({ error: `Assets not found: ${missing.join(", ")}` }, { status: 400 })
  }

  // Shared claim contract. Uses renderStartedAt (added in the async-work
  // migration) for stale-recovery — anything older than 5min in status=
  // "rendering" is treated as a container-crashed leftover and reclaimable.
  const decision = await claimAsyncWork({
    currentStatus: ad.status,
    currentStartedAt: ad.renderStartedAt,
    activeStatus: "rendering",
    staleAfterMs: STALE_WINDOWS.businessRender,
    claim: async () => {
      const staleThreshold = new Date(Date.now() - STALE_WINDOWS.businessRender)
      const res = await prisma.ad.updateMany({
        where: {
          id: adId,
          business: { userId },
          OR: [
            { status: { not: "rendering" } },
            { renderStartedAt: { lt: staleThreshold } },
            { renderStartedAt: null },
          ],
        },
        data: {
          status: "rendering",
          renderStartedAt: new Date(),
          renderFailureCode: null,
          renderFailureMessage: null,
        },
      })
      return res.count
    },
  })
  if (!decision.ok) {
    return NextResponse.json({ error: "Render already in progress" }, { status: 409 })
  }

  // Cartoon presenter: resolve the character's style image + eligibility
  // BEFORE the fire-and-forget so a bad setup fails the request, not the job.
  let presenterOptions: NonNullable<Parameters<typeof renderAd>[3]>["presenter"] = null
  if (ad.presenterCharacterId && ad.voiceoverEnabled) {
    const character = await prisma.character.findFirst({
      where: { id: ad.presenterCharacterId, userId },
      select: { selectedStyleUrl: true, selectedStyle: true },
    })
    if (character?.selectedStyleUrl && isPresenterEligibleStyle(character.selectedStyle)) {
      presenterOptions = {
        characterId: ad.presenterCharacterId,
        styleImageUrl: character.selectedStyleUrl,
        slot: ad.presenterSlot === "cta" ? "cta" : "hook",
        replicateToken: process.env.REPLICATE_API_TOKEN ?? "",
        cached: {
          clipUrl: ad.presenterClipUrl,
          keyframeUrl: ad.presenterKeyframeUrl,
          lineHash: ad.presenterClipLineHash,
        },
      }
    }
  }

  void emit("render_started", { adId, templateFamily: ad.templateFamily, aspectRatio: ad.aspectRatio }, userId)

  fireAndForget({
    tag: "business/render",
    id: adId,
    work: async () => {
      const workDir = join(tmpdir(), `atve_render_${adId}_${Date.now()}`)
      const startedAt = Date.now()
      try {
        const imagePaths = await downloadAssetsToLocal(urlsByAssetId, workDir)
        const captionFontPath = publicPath("scrapbook/handwriting.ttf")
        const result = await renderAd(script, { imagePaths, captionFontPath }, adId, {
          voiceoverEnabled: ad.voiceoverEnabled,
          captionsEnabled: ad.captionsEnabled,
          qrEnabled: ad.qrEnabled,
          contactStrip: ad.contactStrip,
          contact: { phone: ad.business.phone, website: ad.business.website },
          presenter: presenterOptions,
        })

        const renderAsset = await prisma.asset.create({
          data: {
            userId,
            kind: "render",
            url: result.finalVideoUrl,
            blobPath: `business/ads/${adId}/render.mp4`,
            mimeType: "video/mp4",
            sizeBytes: 0,
            meta: { durationSec: result.durationSec, versionNo: ad.currentVersion },
          },
        })

        await prisma.adVersion.updateMany({
          where: { adId, versionNo: ad.currentVersion },
          data: { renderAssetId: renderAsset.id },
        })

        await prisma.ad.update({
          where: { id: adId },
          data: {
            status: "ready",
            renderStartedAt: null,
            renderFailureCode: null,
            renderFailureMessage: null,
            // Cache the presenter artifacts so re-renders skip regeneration
            // unless the spoken line changed.
            ...(result.presenter?.used
              ? {
                  presenterClipUrl: result.presenter.clipUrl,
                  presenterKeyframeUrl: result.presenter.keyframeUrl,
                  presenterClipLineHash: result.presenter.lineHash,
                }
              : {}),
          },
        })
        if (result.presenter?.fallbackReason) {
          console.log(`[render] ${adId} presenter fell back: ${result.presenter.fallbackReason}`)
        }

        void emit("render_completed", {
          adId,
          templateFamily: ad.templateFamily,
          aspectRatio: ad.aspectRatio,
          durationMs: Date.now() - startedAt,
          segment: "business",
        }, userId)
        // Latency telemetry (D2): cumulative ms per pipeline phase.
        void emit("render_timing", {
          adId,
          segment: "business",
          totalMs: Date.now() - startedAt,
          ...result.phaseMarks,
        }, userId)
      } finally {
        const { promises: fs } = await import("fs")
        await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
      }
    },
    onError: async (err) => {
      await prisma.ad.update({
        where: { id: adId },
        data: {
          status: "failed",
          renderStartedAt: null,
          renderFailureCode: err.code,
          renderFailureMessage: err.message,
        },
      }).catch(() => {})
      void emit("render_failed", { adId, code: err.code }, userId)
    },
  })

  return NextResponse.json(
    { status: "rendering", adId, reclaimedStale: decision.wasStale },
    { status: 202 },
  )
}
