import { prisma } from "@/lib/db/client"

// Central query builder for /gallery listings. Public — filters MUST enforce
// galleryOptIn and status=ready; those invariants are covered by tests.

export type GalleryFilters = {
  templateFamily?: string  // optional filter for "Make an ad like this" CTA
  limit?: number
}

// Public representation — never leaks business.userId or any PII beyond the
// public business name.
export type GalleryAdCard = {
  id: string
  templateFamily: string
  aspectRatio: string
  businessName: string
  finalVideoUrl: string | null   // direct blob URL, resolved from the currentVersion's render
  createdAt: string
}

async function resolveRenderUrl(adId: string, currentVersion: number): Promise<string | null> {
  const version = await prisma.adVersion.findUnique({
    where: { adId_versionNo: { adId, versionNo: currentVersion } },
    select: { renderAssetId: true },
  })
  if (!version?.renderAssetId) return null
  const asset = await prisma.asset.findUnique({ where: { id: version.renderAssetId } })
  return asset?.url ?? null
}

export async function listGalleryAds(filters: GalleryFilters = {}): Promise<GalleryAdCard[]> {
  const limit = Math.min(50, Math.max(1, filters.limit ?? 24))
  const ads = await prisma.ad.findMany({
    where: {
      galleryOptIn: true,
      status: "ready",
      ...(filters.templateFamily && { templateFamily: filters.templateFamily }),
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: {
      business: { select: { name: true } },
    },
  })
  const cards: GalleryAdCard[] = []
  for (const a of ads) {
    const finalVideoUrl = await resolveRenderUrl(a.id, a.currentVersion)
    if (!finalVideoUrl) continue  // status=ready but no render asset = corrupt state; skip
    cards.push({
      id: a.id,
      templateFamily: a.templateFamily,
      aspectRatio: a.aspectRatio,
      businessName: a.business.name,
      finalVideoUrl,
      createdAt: a.createdAt.toISOString(),
    })
  }
  return cards
}

export async function getGalleryAd(adId: string): Promise<GalleryAdCard | null> {
  const ad = await prisma.ad.findFirst({
    where: { id: adId, galleryOptIn: true, status: "ready" },
    include: { business: { select: { name: true } } },
  })
  if (!ad) return null
  const finalVideoUrl = await resolveRenderUrl(ad.id, ad.currentVersion)
  if (!finalVideoUrl) return null
  return {
    id: ad.id,
    templateFamily: ad.templateFamily,
    aspectRatio: ad.aspectRatio,
    businessName: ad.business.name,
    finalVideoUrl,
    createdAt: ad.createdAt.toISOString(),
  }
}
