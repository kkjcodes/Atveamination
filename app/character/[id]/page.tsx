import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth/config"
import { prisma } from "@/lib/db/client"
import Nav from "@/components/nav"
import RetrainButton from "@/components/retrain-button"
import TrainingProgress from "@/components/training-progress"
import DeleteButton from "@/components/delete-button"
import AugmentAndTrainButton from "@/components/augment-and-train-button"
import CharacterDescriptionEditor from "@/components/character-description-editor"
import CharacterNameEditor from "@/components/character-name-editor"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"

type TrainingStatus = "pending" | "processing" | "succeeded" | "failed" | "canceled"

const STATUS_VARIANT: Record<TrainingStatus, "default" | "warning" | "success" | "destructive" | "secondary"> = {
  pending:    "warning",
  processing: "default",
  succeeded:  "success",
  failed:     "destructive",
  canceled:   "secondary",
}

const STATUS_LABEL: Record<TrainingStatus, string> = {
  pending:    "Pending",
  processing: "Training…",
  succeeded:  "Ready",
  failed:     "Failed",
  canceled:   "Canceled",
}

export default async function CharacterPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const session = await getServerSession(authOptions)
  if (!session) redirect("/auth/login")

  const userId = session.user.id

  const [character, activeJob, voice] = await Promise.all([
    prisma.character.findFirst({
      where: { id, userId },
      include: { options: true },
    }),
    prisma.job.findFirst({
      where: { entityId: id, entityType: "character", status: "processing" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.voice.findFirst({
      where: { characterId: id, userId },
      orderBy: { createdAt: "desc" },
    }),
  ])

  if (!character) notFound()

  const status = character.loraTrainingStatus as TrainingStatus | null
  const trainingDone = status === "succeeded"
  const voiceStyle = (voice?.ttsParams as Record<string, string> | null)?.style
  const augmentedCount = Array.isArray(character.trainingImages)
    ? (character.trainingImages as unknown[]).length
    : 0

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: character.name }]} />
      <div className="max-w-3xl mx-auto py-10 px-4">

        {/* Header */}
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <CharacterNameEditor characterId={id} initialName={character.name} />
            <div className="flex items-center gap-2 mt-2">
              {status ? (
                <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>
              ) : (
                <Badge variant="secondary">No training started</Badge>
              )}
            </div>
            <div className="mt-3 max-w-lg">
              <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-1">Character Description</p>
              <CharacterDescriptionEditor
                characterId={id}
                initialDescription={character.characterDescription ?? null}
              />
            </div>
          </div>

          <div className="flex gap-2 shrink-0 mt-1 flex-wrap justify-end">
            <DeleteButton
              url={`/api/characters/${id}`}
              redirectTo="/dashboard"
              className="text-zinc-400 hover:text-red-500 hover:bg-red-50"
            />
            {status === "failed" && <RetrainButton characterId={id} />}
            <Button
              asChild={trainingDone}
              size="lg"
              disabled={!trainingDone}
            >
              {trainingDone ? (
                <Link href={`/studio/new?character=${id}${voice ? `&voice=${voice.id}` : ""}`}>
                  Create Video
                </Link>
              ) : (
                <span>Create Video</span>
              )}
            </Button>
          </div>
        </div>

        {/* Training progress */}
        {status === "processing" && (
          <TrainingProgress jobId={activeJob?.id ?? null} />
        )}

        {status === "failed" && (
          <div className="mb-8 rounded-xl bg-red-50 border border-red-200 px-5 py-4 text-sm text-red-800">
            <p className="font-medium">Training failed</p>
            <p className="mt-1 text-red-600">
              Use the Retrain button above to start a new training run.
            </p>
          </div>
        )}

        {/* Voice prompt — shown when trained but no voice yet */}
        {trainingDone && !voice && (
          <Card className="mb-8">
            <CardContent className="py-5 flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-zinc-900">Voice</p>
                <p className="text-sm text-zinc-500 mt-0.5">
                  Record a voice sample to add narration to your videos.
                </p>
              </div>
              <Button asChild variant="default" size="sm" className="shrink-0">
                <Link href={`/voice/${id}`}>Set Up Voice</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Training complete — collapsible details */}
        {trainingDone && (
          <details className="mb-8 rounded-xl border border-zinc-200 bg-white shadow-sm">
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none select-none">
              <div className="flex items-center gap-2.5">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="font-medium text-zinc-800">Training complete</span>
                {voice && <span className="text-sm text-zinc-400">· Voice configured</span>}
              </div>
              <span className="text-sm text-violet-600 shrink-0">More options ›</span>
            </summary>

            <div className="border-t border-zinc-100 px-5 py-4 space-y-5">
              {/* Training data + retrain */}
              {character.selectedStyleUrl && (
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Training Data</p>
                    {augmentedCount >= 10 ? (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {augmentedCount} images · 1,500 steps — high accuracy training
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        1 image · 1,000 steps — generate 20 variations for much better accuracy
                      </p>
                    )}
                  </div>
                  <AugmentAndTrainButton characterId={id} hasAugmentedImages={augmentedCount >= 10} />
                </div>
              )}

              {/* Update voice — only shown here when voice already exists */}
              {voice && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900">Voice</p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Style: <span className="capitalize">{voiceStyle ?? "custom"}</span> · Voice sample recorded
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link href={`/voice/${id}`}>Update Voice</Link>
                  </Button>
                </div>
              )}

              {/* Selected style image */}
              {character.selectedStyleUrl && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Selected Style</p>
                  <div className="rounded-xl overflow-hidden border border-zinc-100 h-48 bg-zinc-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={character.selectedStyleUrl}
                      alt={`${character.name} selected style`}
                      className="w-full h-full object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Style options gallery */}
              {character.options.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">All Style Options</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {character.options.map((opt) => {
                      const isSelected = character.selectedStyleUrl === opt.styleUrl
                      return (
                        <div
                          key={opt.id}
                          className={`rounded-xl border-2 overflow-hidden ${
                            isSelected ? "border-violet-500" : "border-zinc-200"
                          }`}
                        >
                          <div className="aspect-square bg-zinc-100">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={opt.styleUrl}
                              alt={opt.styleName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="py-2 px-3 flex items-center justify-between">
                            <p className="text-xs font-medium text-zinc-700 capitalize">
                              {opt.styleName}
                            </p>
                            {isSelected && (
                              <span className="text-xs text-violet-600 font-semibold">✓</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </details>
        )}

        {/* Style gallery — shown when not yet trained (so user can see options while waiting) */}
        {!trainingDone && character.selectedStyleUrl && (
          <Card className="mb-8 overflow-hidden">
            <div className="h-72 w-full bg-zinc-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={character.selectedStyleUrl}
                alt={`${character.name} selected style`}
                className="w-full h-full object-contain"
              />
            </div>
            <CardContent className="py-4">
              <p className="text-sm text-zinc-500">Selected cartoon style</p>
            </CardContent>
          </Card>
        )}

        {!trainingDone && character.options.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-zinc-800 mb-4">Style Options</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {character.options.map((opt) => {
                const isSelected = character.selectedStyleUrl === opt.styleUrl
                return (
                  <div
                    key={opt.id}
                    className={`rounded-xl border-2 overflow-hidden ${
                      isSelected ? "border-violet-500" : "border-zinc-200"
                    }`}
                  >
                    <div className="aspect-square bg-zinc-100">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={opt.styleUrl}
                        alt={opt.styleName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="py-2 px-3 flex items-center justify-between">
                      <p className="text-xs font-medium text-zinc-700 capitalize">
                        {opt.styleName}
                      </p>
                      {isSelected && (
                        <span className="text-xs text-violet-600 font-semibold">✓</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
