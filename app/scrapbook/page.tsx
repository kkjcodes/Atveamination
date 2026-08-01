import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import Nav from "@/components/nav"
import { STYLE_PRESETS, type ScrapbookStyle } from "@/lib/scrapbook/config"

export default async function ScrapbookListPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/auth/login")

  const projects = await prisma.scrapbookProject.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { pages: true } },
      pages: {
        orderBy: { orderIndex: "asc" },
        take: 3,
        select: { sourcePhotoUrl: true },
      },
    },
  })

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Scrapbook" }]} />
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900">Scrapbook videos</h1>
            <p className="text-zinc-500 mt-1">
              Turn photos into a cartoon scrapbook that flips through moments.
            </p>
          </div>
          <Button asChild size="lg" className="gap-2">
            <Link href="/scrapbook/new">+ New scrapbook</Link>
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <div className="text-4xl mb-3">📖</div>
              <h2 className="text-lg font-semibold text-zinc-800">No scrapbooks yet</h2>
              <p className="text-sm text-zinc-500 mt-1.5 mb-5">
                Upload a few photos and pick a style — we&apos;ll make an animated scrapbook.
              </p>
              <Button asChild>
                <Link href="/scrapbook/new">Create your first scrapbook</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project) => {
              const style = STYLE_PRESETS[project.style as ScrapbookStyle] ?? STYLE_PRESETS.watercolor
              return (
                <Link key={project.id} href={`/scrapbook/${project.id}`}>
                  <Card className="cursor-pointer hover:ring-2 hover:ring-violet-200 transition-all overflow-hidden">
                    <CardContent className="p-0">
                      <div className="flex h-32 bg-zinc-100">
                        {project.pages.length === 0 ? (
                          <div className="w-full flex items-center justify-center text-zinc-300 text-3xl">📷</div>
                        ) : (
                          project.pages.map((p, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={i}
                              src={p.sourcePhotoUrl}
                              alt=""
                              className="flex-1 object-cover"
                            />
                          ))
                        )}
                      </div>
                      <div className="p-4">
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-semibold text-zinc-900 truncate">{project.title}</p>
                          {project.status === "done" && (
                            <span className="text-xs font-medium text-green-700 bg-green-50 rounded-full px-2 py-0.5">Done</span>
                          )}
                          {project.status === "generating" && (
                            <span className="text-xs font-medium text-violet-700 bg-violet-50 rounded-full px-2 py-0.5 animate-pulse">Generating</span>
                          )}
                          {project.status === "draft" && (
                            <span className="text-xs font-medium text-zinc-500 bg-zinc-100 rounded-full px-2 py-0.5">Draft</span>
                          )}
                          {project.status === "failed" && (
                            <span className="text-xs font-medium text-red-600 bg-red-50 rounded-full px-2 py-0.5">Failed</span>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500">
                          {style.label} · {project._count.pages} {project._count.pages === 1 ? "page" : "pages"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
