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
import DeleteButton from "@/components/delete-button"

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
  return <Badge variant={variant}>{status}</Badge>
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
          <p className="mt-1 text-zinc-500">Here&apos;s everything you&apos;ve created.</p>
        </div>

        {/* Characters */}
        <section className="mb-14">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">Characters</h2>
              {isUnlimited ? (
                <p className="mt-0.5 text-sm font-medium text-violet-600">Unlimited characters — Super User</p>
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
              <Link href="/character/new">+ New Character</Link>
            </Button>
          </div>

          {characters.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <div className="mb-3 text-5xl">🎭</div>
                <h3 className="mb-1 font-semibold text-zinc-900">No characters yet</h3>
                <p className="mb-6 text-sm text-zinc-500 max-w-xs">
                  Upload a photo to create your first AI cartoon character. It only takes a few minutes.
                </p>
                <Button asChild>
                  <Link href="/character/new">Create Your First Character</Link>
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
                    <p className="text-sm font-medium text-violet-600">New Character</p>
                  </CardContent>
                </Card>
              </Link>

              {characters.map((char) => (
                <div key={char.id} className="relative group">
                  <Link href={`/character/${char.id}`}>
                    <Card className="cursor-pointer overflow-hidden transition-shadow hover:shadow-md h-full">
                      <div className="aspect-square w-full overflow-hidden bg-zinc-100">
                        {char.selectedStyleUrl ?? char.sourcePhotoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={char.selectedStyleUrl ?? char.sourcePhotoUrl!}
                            alt={char.name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-4xl text-zinc-300">👤</div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-zinc-900 truncate">{char.name}</p>
                          {statusBadge(char.loraTrainingStatus)}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                  {/* Delete button — always visible on touch, hover-reveal on desktop */}
                  <div className="absolute top-2 right-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <DeleteButton
                      url={`/api/characters/${char.id}`}
                      className="bg-white/90 border border-zinc-200 shadow-sm text-zinc-500 hover:text-red-500 hover:bg-red-50 text-xs px-2 py-1 h-auto rounded-md"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Recent Projects */}
        <section>
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-zinc-900">Recent Projects</h2>
            {projects.length > 0 && (
              <Button asChild variant="outline" size="sm">
                <Link href="/projects">View all</Link>
              </Button>
            )}
          </div>

          {projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center py-16 text-center">
                <div className="mb-3 text-5xl">🎬</div>
                <h3 className="mb-1 font-semibold text-zinc-900">No projects yet</h3>
                <p className="text-sm text-zinc-500">
                  {characters.length === 0
                    ? "Create a character first, then start your first video project."
                    : "Pick a character and start your first video project."}
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
                  <CardContent className="flex gap-2 pt-0">
                    {proj.status === "succeeded" && proj.finalVideoUrl ? (
                      <Button asChild size="sm" variant="outline" className="flex-1">
                        <a href={proj.finalVideoUrl} download>Download</a>
                      </Button>
                    ) : (
                      <Button asChild size="sm" className="flex-1">
                        <Link href={`/studio/${proj.id}`}>Continue</Link>
                      </Button>
                    )}
                    <DeleteButton url={`/api/projects/${proj.id}`} />
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
