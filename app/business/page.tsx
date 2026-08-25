import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import Link from "next/link"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import BusinessMarketing from "./marketing"
import { BRAND } from "@/config/brand"

// Same URL serves marketing (anon) and workspace (auth), so metadata targets
// the marketing pitch (that's the one Google crawls anyway — Googlebot is
// always unauthenticated).
// title.absolute bypasses the root layout's title.template ("· <product name>")
// so we get a single clean title instead of a duplicated brand.
export const metadata: Metadata = {
  title: { absolute: `AI ad generator for small businesses — ${BRAND.productName}` },
  description: "Turn photos of your work into a ready-to-post video ad. Script, voice-over, music, and sizing done for you. No filming or editing.",
  alternates: { canonical: "/business" },
  openGraph: {
    title: "AI ad generator for small businesses",
    description: "Photos in, ready-to-post video ad out. No filming or editing.",
    url: "/business",
    images: ["/og-image.png"],
  },
}

// /business is auth-aware. Anonymous visitors see the public marketing page
// (single URL for external ads: <domain>/business). Authenticated
// users see their workspace with draft/ready list. This lets us market the
// short URL without forcing a signup wall before the pitch.
//
// Workspace resumability: draft businesses take priority — user is routed
// to /business/new?resume=<id> to finish onboarding before doing anything
// else.
export default async function BusinessHomePage() {
  const session = await getServerSession(authOptions)
  if (!session) return <BusinessMarketing />

  const userId = session.user.id

  // Prefer resuming: the most-recently-updated draft wins. Ready businesses
  // are only shown once there's no active draft to complete.
  const [draft, ready] = await Promise.all([
    prisma.business.findFirst({
      where: { userId, status: "draft" },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.business.findMany({
      where: { userId, status: "ready" },
      orderBy: { updatedAt: "desc" },
      take: 20,
    }),
  ])

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Business" }]} />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-8">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-700 mb-1">For your business</p>
          <h1 className="text-3xl font-bold text-zinc-900">Your ads</h1>
          <p className="text-zinc-500 mt-1">
            Upload photos of your work. Get a ready-to-post video ad with a voice and music.
          </p>
        </div>

        {draft && (
          <Card className="mb-6 border-orange-200 bg-orange-50/50">
            <CardContent className="p-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wide mb-1">You started this one</p>
                <p className="font-semibold text-zinc-900">
                  {draft.name?.trim() || "Untitled draft"}
                </p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Pick it back up where you left off.
                </p>
              </div>
              <Button asChild size="lg">
                <Link href={`/business/new?resume=${draft.id}`}>Pick it back up <span aria-hidden="true">→</span></Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-800">
            {ready.length > 0 ? "Your businesses" : ""}
          </h2>
          {!draft && (
            <Button asChild>
              <Link href="/business/new">Add another business</Link>
            </Button>
          )}
        </div>

        {ready.length === 0 && !draft ? (
          <Card>
            <CardContent className="py-14 text-center">
              <div className="text-4xl mb-3">🥖</div>
              <h2 className="text-lg font-semibold text-zinc-800">No businesses yet</h2>
              <p className="text-sm text-zinc-500 mt-1.5 mb-5 max-w-md mx-auto">
                Tell us about your shop and upload a few photos — we&apos;ll make a video ad you can post today.
              </p>
              <Button asChild size="lg">
                <Link href="/business/new">Add my first business</Link>
              </Button>
            </CardContent>
          </Card>
        ) : ready.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ready.map((b) => (
              <Link key={b.id} href={`/business/${b.id}`}>
                <Card className="cursor-pointer hover:ring-2 hover:ring-amber-300 transition-all">
                  <CardContent className="p-5">
                    <p className="font-semibold text-zinc-900 mb-1">
                      {b.name || "Untitled business"}
                    </p>
                    <p className="text-sm text-zinc-500 line-clamp-2">
                      {b.oneLiner || "Add a one-liner to get started."}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}
