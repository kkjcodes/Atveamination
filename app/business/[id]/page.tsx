import { getServerSession } from "next-auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import Nav from "@/components/nav"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import BusinessAdGenerator from "./ad-generator"
import { musicForFamily } from "@/lib/business/music-catalog"
import { TEMPLATE_FAMILIES, type TemplateFamily } from "@/lib/business/adscript-schema"
import { isPresenterEligibleStyle } from "@/lib/business/presenter"

// /business/[id] — business detail page. Shows the business, lets the user
// pick a template family + aspect ratio, then triggers ad generation
// (POST /api/business/[id]/ads) and redirects to /business/ads/[adId] on
// success. Also lists any existing ads so the user can re-open them.
export default async function BusinessDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/auth/login?redirect=/business")

  const { id } = await params

  const business = await prisma.business.findFirst({
    where: { id, userId: session.user.id },
    include: {
      ads: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  })
  if (!business) notFound()

  const photoAssets = await prisma.asset.findMany({
    where: {
      userId: session.user.id,
      kind: "product_photo",
      blobPath: { startsWith: `business/${id}/photos/` },
    },
    orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
    select: { id: true, url: true },
  })

  // Usage counts from each ad's current script — shown as badges in the
  // photo picker so evergreen shots (storefront, end credit) are easy to spot.
  // Listing order stays the user's arranged library order.
  const uses = new Map<string, number>()
  for (const ad of business.ads) {
    const script = ad.adScript as { scenes?: Array<{ asset_id?: string }> } | null
    for (const sc of script?.scenes ?? []) {
      if (sc.asset_id) uses.set(sc.asset_id, (uses.get(sc.asset_id) ?? 0) + 1)
    }
  }
  const photos = photoAssets.map((p) => ({ ...p, uses: uses.get(p.id) ?? 0 }))

  // Music catalog per template family for the picker (label + public preview path).
  const musicEntries = await Promise.all(
    TEMPLATE_FAMILIES.map(async (tf) => {
      const tracks = await musicForFamily(tf)
      return [tf, tracks.map((t) => ({ id: t.id, label: t.label, path: t.path }))] as const
    }),
  )
  const music = Object.fromEntries(musicEntries) as Record<TemplateFamily, { id: string; label: string; path: string }[]>

  // Cartoon presenter candidates: any character with a picked style. Style
  // eligibility comes from the lip-sync bench allowlist (server-side — the
  // presenter module must not enter the client bundle).
  const presenterChars = (await prisma.character.findMany({
    where: { userId: session.user.id, selectedStyleUrl: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, selectedStyleUrl: true, selectedStyle: true },
  })).map((c) => ({
    id: c.id,
    name: c.name,
    styleUrl: c.selectedStyleUrl!,
    style: c.selectedStyle ?? "",
    eligible: isPresenterEligibleStyle(c.selectedStyle),
  }))

  const ads = business.ads

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Business", href: "/business" }, { label: business.name || "Business" }]} />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-1">For businesses</p>
        <h1 className="text-3xl font-bold text-zinc-900 mb-1">{business.name || "Untitled business"}</h1>
        <p className="text-zinc-500 mb-8">{business.oneLiner}</p>

        {photos.length === 0 ? (
          <Card className="border-amber-200 bg-amber-50/50 mb-6">
            <CardContent className="p-5">
              <p className="text-sm text-amber-900 mb-3">
                No photos yet. Add product photos before generating an ad.
              </p>
              <Button asChild size="sm">
                <Link href={`/business/new?resume=${business.id}`}>Add photos</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <BusinessAdGenerator
            businessId={business.id}
            photos={photos}
            music={music}
            contact={{ phone: business.phone, website: business.website }}
            presenters={presenterChars}
          />
        )}

        {ads.length > 0 && (
          <div className="mt-10">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 mb-3">Previous ads</h2>
            <div className="space-y-2">
              {ads.map((ad) => (
                <Link key={ad.id} href={`/business/ads/${ad.id}`}>
                  <Card className="cursor-pointer hover:ring-2 hover:ring-amber-200 transition-all">
                    <CardContent className="p-4 flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium text-zinc-800">{ad.templateFamily}</span>
                        <span className="text-zinc-400"> · {ad.aspectRatio}</span>
                      </div>
                      <span className={
                        ad.status === "ready" ? "text-emerald-600" :
                        ad.status === "rendering" ? "text-amber-600" :
                        ad.status === "failed" ? "text-red-600" : "text-zinc-500"
                      }>{ad.status}</span>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
