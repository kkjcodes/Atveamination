import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import Nav from "@/components/nav"
import BusinessOnboarding from "./onboarding"

// Server component: resolves the initial state (either a fresh empty draft
// or the user's existing resume-target) so the client form hydrates with
// data already persisted. This is the resumability contract for M2:
// closing the tab mid-form + revisiting == same state, no work lost.
export default async function NewBusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ resume?: string }>
}) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/auth/signup?redirect=/business/new&segment=business")

  const { resume } = await searchParams

  // Prefer explicit ?resume=<id>, then any existing draft, then null (client
  // will lazy-create on first field change).
  let initialBusiness: {
    id: string
    name: string
    oneLiner: string
    address: string | null
    notes: string | null
    logoAssetId: string | null
  } | null = null
  let initialPhotos: Array<{ id: string; url: string }> = []
  let initialLogoUrl: string | null = null

  const targetId = resume
    ? resume
    : (await prisma.business.findFirst({
        where: { userId: session.user.id, status: "draft" },
        orderBy: { updatedAt: "desc" },
        select: { id: true },
      }))?.id

  if (targetId) {
    const b = await prisma.business.findFirst({
      where: { id: targetId, userId: session.user.id },
      include: { logo: true },
    })
    if (b) {
      initialBusiness = {
        id: b.id,
        name: b.name,
        oneLiner: b.oneLiner,
        address: b.address,
        notes: b.notes,
        logoAssetId: b.logoAssetId,
      }
      initialLogoUrl = b.logo?.url ?? null
      const photos = await prisma.asset.findMany({
        where: {
          userId: session.user.id,
          kind: "product_photo",
          blobPath: { startsWith: `business/${b.id}/photos/` },
        },
        orderBy: [{ orderIndex: "asc" }, { createdAt: "asc" }],
      })
      initialPhotos = photos.map((p) => ({ id: p.id, url: p.url }))
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[
        { label: "Business", href: "/business" },
        { label: initialBusiness ? "Resume" : "New" },
      ]} />
      <div className="mx-auto max-w-2xl px-6 py-10">
        <p className="text-xs font-bold uppercase tracking-widest text-orange-700 mb-1">For your business</p>
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Tell us about your business</h1>
        <p className="text-zinc-500 mb-8">
          We&apos;ll turn your photos into a video ad, with a voice and music.
        </p>

        <BusinessOnboarding
          initialBusiness={initialBusiness}
          initialPhotos={initialPhotos}
          initialLogoUrl={initialLogoUrl}
        />
      </div>
    </div>
  )
}
