import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"
import Link from "next/link"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import { checkTrainingLimit, checkSceneLimit } from "@/lib/limits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Nav from "@/components/nav"
import { statusLabel } from "@/lib/copy"
import DeleteButton from "@/components/delete-button"
import ShareButtons from "@/components/share-buttons"

type TrainingStatus = "pending" | "processing" | "succeeded" | "failed" | "canceled"

const STATUS_VARIANT: Record<TrainingStatus, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  pending:    "secondary",
  processing: "warning",
  succeeded:  "success",
  failed:     "destructive",
  canceled:   "secondary",
}

function statusBadge(status: string | null) {
  if (!status) return null
  const variant = STATUS_VARIANT[status as TrainingStatus] ?? "default"
  // User-facing vocabulary from lib/copy.ts — "processing"/"succeeded" are
  // internal DB values and shouldn't leak into the UI.
  const label = statusLabel(status)
  return <Badge variant={variant}>{label}</Badge>
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/auth/login")

  const userId = session.user.id
  const displayName = session.user.name ?? session.user.email ?? "there"

  const role = session.user.role
  const [characters, projects, charLimit, sceneLimit] = await Promise.all([
    prisma.character.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: { voices: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { scenes: { select: { id: true } } },
    }),
    checkTrainingLimit(userId, role),
    checkSceneLimit(userId, role),
  ])
  const isUnlimited = charLimit.limit === Infinity

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />

      <main className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-10">
          <p className="text-2xl font-bold text-zinc-900">
            Welcome back, {displayName}
          </p>
          <p className="mt-1 text-zinc-500">Here&apos;s everything you&apos;ve made.</p>
        </div>

        {/* Characters */}
        <section className="mb-14">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">Characters</h2>
              {isUnlimited ? (
                <p className="mt-0.5 text-sm font-medium text-violet-600">Unlimited characters</p>
              ) : (
                <p className="mt-0.5 text-sm text-zinc-500">
                  {characters.length} of {charLimit.limit} created
                  {charLimit.limit - characters.length > 0
                    ? ` · ${charLimit.limit - characters.length} slot${charLimit.limit - characters.length !== 1 ? "s" : ""} remaining`
                    : " · limit reached"}
                </p>
              )}
            </div>
            <Button asChild size="sm" disabled={!isUnlimited && characters.length >= (charLimit.limit as number)}>
              <Link href="/character/new">Add a character</Link>
            </Button>
          </div>

          {/* Group video CTA — show when 2+ characters have a style ready */}
          {(() => {
            const readyChars = characters.filter((c) => c.selectedStyleUrl)
            if (readyChars.length < 2) return null
            const ids = readyChars.slice(0, 4).map((c) => c.id).join(",")
            return (
              <div className="mb-5 flex items-center justify-between bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 rounded-xl px-5 py-4">
                <div>
                  <p className="font-semibold text-orange-900 text-sm">You have {readyChars.length} characters ready</p>
                  <p className="text-xs text-orange-700 mt-0.5">Put them all in one video together.</p>
                </div>
                <Button asChild size="sm" className="bg-orange-500 hover:bg-orange-600 text-white border-0 shrink-0 ml-4">
                  <Link href={`/studio/new?characters=${ids}`}>Make a video with all of them</Link>
                </Button>
              </div>
            )
          })()}

          {characters.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <div className="mb-3 text-5xl">🎭</div>
                <h3 className="mb-1 font-semibold text-zinc-900">No characters yet — let&apos;s fix that.</h3>
                <p className="mb-6 text-sm text-zinc-500 max-w-xs">
                  Upload a photo and we&apos;ll turn you into a cartoon character.
                </p>
                <Button asChild>
                  <Link href="/character/new">Add my first character</Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {/* Create new card */}
              <Link href="/character/new">
                <Card className="flex h-full cursor-pointer items-center justify-center border-dashed transition-colors hover:border-violet-300 hover:bg-violet-50">
                  <CardContent className="flex flex-col items-center py-10 text-center">
                    <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-2xl">
                      +
                    </div>
                    <p className="text-sm font-medium text-violet-600">Add a character</p>
                  </CardContent>
                </Card>
              </Link>

              {characters.map((char) => {
                const voiceId = char.voices[0]?.id
                const studioUrl = `/studio/new?character=${char.id}${voiceId ? `&voice=${voiceId}` : ""}`
                const canMakeVideo = !!char.selectedStyleUrl
                return (
                  <div key={char.id} className="relative group">
                    <Card className="overflow-hidden transition-shadow hover:shadow-md h-full flex flex-col">
                      {/* Image — click to manage character */}
                      <Link href={`/character/${char.id}`} className="block shrink-0">
                        <div className="aspect-square w-full overflow-hidden bg-zinc-100">
                          {char.selectedStyleUrl ?? char.sourcePhotoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={char.selectedStyleUrl ?? char.sourcePhotoUrl!}
                              alt={char.name}
                              className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-4xl text-zinc-300">👤</div>
                          )}
                        </div>
                      </Link>
                      <CardContent className="p-4 flex flex-col gap-3 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-zinc-900 truncate">{char.name}</p>
                          {statusBadge(char.loraTrainingStatus)}
                        </div>
                        <div className="flex gap-2 mt-auto">
                          <Button
                            asChild={canMakeVideo}
                            size="sm"
                            className="flex-1"
                            disabled={!canMakeVideo}
                            title={!canMakeVideo ? "Pick a style for this character first, then hit roll." : undefined}
                          >
                            {canMakeVideo ? (
                              <Link href={studioUrl}>Roll it</Link>
                            ) : (
                              <span>Roll it</span>
                            )}
                          </Button>
                          <Button asChild size="sm" variant="ghost" className="text-zinc-500 shrink-0">
                            <Link href={`/character/${char.id}`}>Character settings</Link>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                    {/* Delete button — always visible on touch, hover-reveal on desktop */}
                    <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      <DeleteButton
                        url={`/api/characters/${char.id}`}
                        className="bg-white/90 border border-zinc-200 shadow-sm text-zinc-500 hover:text-red-500 hover:bg-red-50 text-xs px-2 py-1 h-auto rounded-md"
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Scrapbook entry point — the nav link is hidden on mobile, so the
            dashboard needs its own path to /scrapbook */}
        <section className="mb-14">
          <div className="flex items-center justify-between bg-gradient-to-r from-rose-50 to-amber-50 border border-rose-200 rounded-xl px-5 py-4">
            <div>
              <p className="font-semibold text-rose-900 text-sm">Scrapbook videos</p>
              <p className="text-xs text-rose-700 mt-0.5">Turn photos into a cartoon scrapbook that flips through moments.</p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0 ml-4">
              <Link href="/scrapbook">Open scrapbook</Link>
            </Button>
          </div>
        </section>

        {/* Recent Projects */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900">Recent videos</h2>
            {projects.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/projects">See all videos</Link>
              </Button>
            )}
          </div>

          {projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <div className="mb-3 text-5xl">🎬</div>
                <h3 className="mb-1 font-semibold text-zinc-900">No videos yet.</h3>
                <p className="text-sm text-zinc-500">
                  {characters.length === 0
                    ? "Add a character first, then make your first video."
                    : "Pick a character and make your first video."}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((proj) => (
                <Card key={proj.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-snug">{proj.title}</CardTitle>
                      {statusBadge(proj.status)}
                    </div>
                    <p className="text-xs text-zinc-400">
                      {proj.scenes.length} {proj.scenes.length === 1 ? "scene" : "scenes"}
                    </p>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-2 pt-0">
                    <div className="flex gap-2">
                      {proj.status === "succeeded" && proj.finalVideoUrl ? (
                        <Button asChild size="sm" variant="outline" className="flex-1">
                          <a href={proj.finalVideoUrl} download>Download video</a>
                        </Button>
                      ) : (
                        <Button asChild size="sm" className="flex-1">
                          <Link href={`/studio/${proj.id}`}>Keep going</Link>
                        </Button>
                      )}
                      <DeleteButton url={`/api/projects/${proj.id}`} />
                    </div>
                    {proj.status === "succeeded" && proj.finalVideoUrl && (
                      <ShareButtons url={proj.finalVideoUrl} size="sm" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
