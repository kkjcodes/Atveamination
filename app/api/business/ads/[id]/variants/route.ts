import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { ASPECT_RATIOS } from "@/lib/business/adscript-schema"
import type { AdScript } from "@/lib/business/adscript-schema"
import { scriptWithAspect } from "@/lib/business/aspect-variants"

// POST /api/business/ads/[id]/variants — "make all 3 sizes". Creates sibling
// Ads for each aspect ratio this ad doesn't cover yet, copying the current
// script (with aspect_ratio swapped) and all render options. The client then
// triggers a render per sibling. No AI calls — the script is reused verbatim.

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: adId } = await params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = session.user.id

  const ad = await prisma.ad.findFirst({
    where: { id: adId, business: { userId } },
  })
  if (!ad) return NextResponse.json({ error: "Ad not found" }, { status: 404 })
  if (!ad.adScript || ad.currentVersion === 0) {
    return NextResponse.json({ error: "Generate the ad first" }, { status: 400 })
  }

  // Skip aspects that already exist as siblings with the same script lineage
  // is overkill — just skip this ad's own aspect. Users can delete extras.
  const targets = ASPECT_RATIOS.filter((a) => a !== ad.aspectRatio)

  const created: Array<{ id: string; aspectRatio: string }> = []
  for (const aspect of targets) {
    const script = scriptWithAspect(ad.adScript as unknown as AdScript, aspect)
    const sibling = await prisma.ad.create({
      data: {
        businessId: ad.businessId,
        status: "ready",
        templateFamily: ad.templateFamily,
        aspectRatio: aspect,
        adScript: script as unknown as object,
        currentVersion: 1,
        preferredVoice: ad.preferredVoice,
        voiceoverEnabled: ad.voiceoverEnabled,
        occasion: ad.occasion,
        captionsEnabled: ad.captionsEnabled,
        qrEnabled: ad.qrEnabled,
        contactStrip: ad.contactStrip,
        galleryOptIn: false,
      },
    })
    await prisma.adVersion.create({
      data: {
        adId: sibling.id,
        versionNo: 1,
        adScript: script as unknown as object,
        editRequest: `size variant of ${ad.id} (${aspect})`,
      },
    })
    created.push({ id: sibling.id, aspectRatio: aspect })
  }

  return NextResponse.json({ created }, { status: 201 })
}
