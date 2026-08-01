import { prisma } from "@/lib/db/client"
import { checkClip } from "@/lib/scrapbook/qc"
import { logError } from "@/lib/logger"
import { promises as fs } from "fs"
import { join } from "path"
import { tmpdir } from "os"

// runQcAndFinalize lives outside pipeline.ts so callers (the fal webhook)
// can import it without transitively pulling in the Anthropic SDK — that
// SDK instantiates a network client at module-load time and refuses to run
// in jsdom test environments.

async function downloadTo(url: string, destPath: string): Promise<void> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to download (${res.status}): ${url}`)
  await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()))
}

// Called by the subtle-route path AND by the fal webhook after dynamic clips
// arrive. Downloads the clip + before keyframe locally, runs QC, marks page
// done (with usedFallback true if QC failed).
export async function runQcAndFinalize(
  pageId: string,
  rawClipUrl: string,
  beforeKeyframeUrl: string | null,
): Promise<void> {
  const tmp = tmpdir()
  const sessionId = `atve_qc_page_${pageId}_${Date.now()}`
  const clipPath = join(tmp, `${sessionId}_clip.mp4`)
  const beforePath = beforeKeyframeUrl ? join(tmp, `${sessionId}_before.jpg`) : null

  try {
    await downloadTo(rawClipUrl, clipPath)
    if (beforePath && beforeKeyframeUrl) await downloadTo(beforeKeyframeUrl, beforePath)

    const qc = await checkClip(clipPath, beforePath)
    // Terminal state — clear the in-flight timestamp so stale-recovery
    // reasons correctly about future retries.
    await prisma.scrapbookPage.update({
      where: { id: pageId },
      data: {
        qcResult: qc as unknown as object,
        usedFallback: !qc.passed,
        generationPhase: "done",
        generationStartedAt: null,
      },
    })
  } catch (e) {
    logError("/scrapbook/finalize", "qc", { pageId }, e)
    await prisma.scrapbookPage.update({
      where: { id: pageId },
      data: {
        qcResult: { passed: false, reason: `QC crashed: ${(e as Error)?.message}`, metrics: {} } as unknown as object,
        usedFallback: true,
        generationPhase: "done",
        generationStartedAt: null,
      },
    })
  } finally {
    await Promise.all([
      fs.unlink(clipPath).catch(() => {}),
      beforePath ? fs.unlink(beforePath).catch(() => {}) : Promise.resolve(),
    ])
  }
}
