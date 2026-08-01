import { getServerSession } from "next-auth"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import Nav from "@/components/nav"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import BusinessAdGenerator from "./ad-generator"

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

  const photoCount = await prisma.asset.count({
    where: {
      userId: session.user.id,
      kind: "product_photo",
      blobPath: { startsWith: `business/${id}/photos/` },
    },
  })

  const ads = business.ads

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Business", href: "/business" }, { label: business.name || "Business" }]} />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-1">For businesses</p>
        <h1 className="text-3xl font-bold text-zinc-900 mb-1">{business.name || "Untitled business"}</h1>
        <p className="text-zinc-500 mb-8">{business.oneLiner}</p>

        {photoCount === 0 ? (
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
          <BusinessAdGenerator businessId={business.id} photoCount={photoCount} />
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
