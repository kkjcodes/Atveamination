import Link from "next/link"
import Nav from "@/components/nav"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { listGalleryAds } from "@/lib/business/gallery"

// Public page — no auth required. Lists opted-in, ready ads. Every card
// links to the per-ad public page which has the "Make an ad like this" CTA.
export default async function GalleryPage({
  searchParams,
}: {
  searchParams: Promise<{ family?: string }>
}) {
  const { family } = await searchParams
  const ads = await listGalleryAds({ templateFamily: family })

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Gallery" }]} />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-700 mb-1">Gallery</p>
          <h1 className="text-3xl font-bold text-zinc-900">Ads made by real businesses on this site</h1>
          <p className="text-zinc-500 mt-1">
            Every one of these was written by AI, made in a few minutes, and downloaded free.
          </p>
        </div>

        {ads.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <div className="text-4xl mb-3">🖼️</div>
              <h2 className="text-lg font-semibold text-zinc-800">No public ads yet. Yours could be the first.</h2>
              <p className="text-sm text-zinc-500 mt-1.5 mb-5 max-w-md mx-auto">
                Turn a few photos into a video ad, opt in to the gallery, and be the first business here.
              </p>
              <Button asChild size="lg">
                <Link href="/business/new">Bring my ad to life</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {ads.map((ad) => (
              <Link key={ad.id} href={`/gallery/${ad.id}`}>
                <Card className="cursor-pointer hover:ring-2 hover:ring-amber-200 transition-all overflow-hidden">
                  <div className="aspect-square bg-zinc-900">
                    <video
                      src={ad.finalVideoUrl ?? undefined}
                      className="w-full h-full object-cover"
                      muted
                      loop
                      playsInline
                      onMouseEnter={(e) => e.currentTarget.play()}
                      onMouseLeave={(e) => e.currentTarget.pause()}
                    />
                  </div>
                  <CardContent className="p-4">
                    <p className="font-semibold text-zinc-900 truncate">{ad.businessName}</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {ad.templateFamily.replace("_", " ")} · {ad.aspectRatio}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
