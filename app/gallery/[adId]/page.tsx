import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getGalleryAd } from "@/lib/business/gallery"

// OG-tagged public per-ad page. The URL is share-friendly; the "Make an ad
// like this" CTA preserves the template family (per doc §6 M6 spec).
export async function generateMetadata({ params }: { params: Promise<{ adId: string }> }): Promise<Metadata> {
  const { adId } = await params
  const ad = await getGalleryAd(adId)
  if (!ad) return { title: "Not found — AtVe Gallery" }
  return {
    title: `${ad.businessName} — AtVe Gallery`,
    description: `A ${ad.templateFamily.replace("_", " ")} ad made in about a minute with AtVe. Free.`,
    openGraph: {
      title: `${ad.businessName} — made with AtVe`,
      description: "Video ad rendered in under a minute, downloaded free.",
      videos: ad.finalVideoUrl ? [{ url: ad.finalVideoUrl }] : [],
      type: "video.other",
    },
    twitter: {
      card: "player",
      title: `${ad.businessName} — made with AtVe`,
    },
  }
}

export default async function GalleryAdPage({ params }: { params: Promise<{ adId: string }> }) {
  const { adId } = await params
  const ad = await getGalleryAd(adId)
  if (!ad) notFound()

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Gallery", href: "/gallery" }, { label: ad.businessName }]} />
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-1">
          {ad.templateFamily.replace("_", " ")} · {ad.aspectRatio}
        </p>
        <h1 className="text-3xl font-bold text-zinc-900 mb-6">{ad.businessName}</h1>

        <Card>
          <CardContent className="p-4">
            <video
              src={ad.finalVideoUrl ?? undefined}
              controls
              playsInline
              className="w-full rounded-lg bg-black"
            />
            <p className="text-xs text-zinc-400 mt-3">
              Made with AtVe · {new Date(ad.createdAt).toLocaleDateString()}
            </p>
          </CardContent>
        </Card>

        <div className="mt-8 rounded-2xl bg-gradient-to-br from-amber-50 to-stone-100 p-6 text-center">
          <h2 className="text-xl font-bold text-zinc-900 mb-2">Make one for your shop</h2>
          <p className="text-sm text-zinc-600 mb-4">
            Upload a few photos, pick a style, get a ready-to-post video. Free.
          </p>
          <Button asChild size="lg" className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white border-0">
            <Link href={`/business/new?template=${ad.templateFamily}`}>
              Make an ad like this →
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
