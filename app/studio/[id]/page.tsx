"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useParams } from "next/navigation"
import Nav from "@/components/nav"
import DeleteButton from "@/components/delete-button"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Character, JobStatus } from "@/types"

const MAX_SCENES = 100

type LocalScene = {
  id: string | null
  description: string
  voiceScript: string
  durationSeconds: 5 | 10 | 15
  status: JobStatus | "idle"
  imageUrl: string | null
  videoClipUrl: string | null
  audioUrl: string | null
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  )
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  )
}

function RefreshIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  )
}

function makeLocalScene(): LocalScene {
  return { id: null, description: "", voiceScript: "", durationSeconds: 5, status: "idle", imageUrl: null, videoClipUrl: null, audioUrl: null }
}

function deriveStatus(s: Record<string, unknown>): LocalScene["status"] {
  if (s.video_clip_url || s.videoClipUrl) return "succeeded"
  const phase = (s.generation_phase ?? s.generationPhase) as string | null
  if (phase === "image" || phase === "video") return "processing"
  if (phase === "failed") return "failed"
  return "idle"
}

// Module-level so it can be called from effects without stale-closure issues
async function pollUntilDone(sceneId: string): Promise<Record<string, unknown>> {
  while (true) {
    await new Promise((r) => setTimeout(r, 5000))
    const res = await fetch(`/api/scenes/${sceneId}`)
    if (!res.ok) continue
    const { scene } = await res.json()
    if (scene.generation_phase === "failed") throw new Error("Scene generation failed")
    if (scene.video_clip_url) return scene
  }
}

export default function StudioProjectPage() {
  const { id: projectId } = useParams<{ id: string }>()

  const [loading, setLoading] = useState(true)
  const [character, setCharacter] = useState<Character | null>(null)
  const [title, setTitle] = useState("Untitled Video")
  const [scenes, setScenes] = useState<LocalScene[]>([makeLocalScene()])
  const [voiceId, setVoiceId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number | null>(null)
  const [stitching, setStitching] = useState(false)
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [limitReached, setLimitReached] = useState(false)
  const [sceneQuota, setSceneQuota] = useState<{ used: number; limit: number | null; unlimited: boolean } | null>(null)

  const scenesRef = useRef(scenes)
  useEffect(() => { scenesRef.current = scenes }, [scenes])

  useEffect(() => {
    async function load() {
      try {
        const [res, limitsRes] = await Promise.all([
          fetch(`/api/projects/${projectId}`),
          fetch(`/api/limits`),
        ])
        if (limitsRes.ok) {
          const limitsData = await limitsRes.json()
          setSceneQuota({ used: limitsData.scenes.used, limit: limitsData.scenes.limit, unlimited: limitsData.unlimited })
        }
        if (!res.ok) return
        const { project } = await res.json()

        setTitle(project.title ?? "Untitled Video")
        setFinalVideoUrl(project.final_video_url ?? project.finalVideoUrl ?? null)
        setVoiceId(project.voice_id ?? project.voiceId ?? null)

        const dbScenes: Record<string, unknown>[] = project.scenes ?? []
        const mapped = dbScenes.map((s) => ({
          id: s.id as string,
          description: (s.description as string) ?? "",
          voiceScript: ((s.voice_script ?? s.voiceScript ?? "") as string),
          durationSeconds: ((s.duration_seconds ?? s.durationSeconds ?? 5) as 5 | 10 | 15),
          status: deriveStatus(s),
          imageUrl: (s.image_url ?? s.imageUrl ?? null) as string | null,
          videoClipUrl: (s.video_clip_url ?? s.videoClipUrl ?? null) as string | null,
          audioUrl: (s.audio_url ?? s.audioUrl ?? null) as string | null,
        }))

        if (mapped.length > 0) setScenes(mapped)

        const charId = project.character_id ?? project.characterId
        if (charId) {
          const charRes = await fetch(`/api/characters/${charId}`)
          if (charRes.ok) {
            const { character: char } = await charRes.json()
            setCharacter(char)
          }
        }

        // Resume polling for any scenes that were generating when the user left.
        // Webhooks drive server-side completion, but we still poll for UI feedback.
        const inProgress = mapped
          .map((s, i) => ({ ...s, _index: i }))
          .filter((s) => s.status === "processing" && s.id)

        if (inProgress.length > 0) {
          setGenerating(true)
          Promise.all(
            inProgress.map(async ({ id, _index }) => {
              try {
                const done = await pollUntilDone(id!)
                setScenes((prev) => prev.map((s, i) =>
                  i === _index
                    ? { ...s, status: "succeeded" as const, imageUrl: (done.image_url as string) ?? null, videoClipUrl: (done.video_clip_url as string) ?? null, audioUrl: (done.audio_url as string) ?? null }
                    : s
                ))
              } catch {
                setScenes((prev) => prev.map((s, i) => i === _index ? { ...s, status: "failed" as const } : s))
                setError(`Scene ${_index + 1} failed to generate. Please try regenerating it.`)
              }
            })
          ).finally(() => setGenerating(false))
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  const updateScene = useCallback((index: number, patch: Partial<LocalScene>) => {
    setScenes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }, [])

  const addScene = useCallback(() => {
    setScenes((prev) => (prev.length < MAX_SCENES ? [...prev, makeLocalScene()] : prev))
  }, [])

  const deleteScene = useCallback(async (index: number) => {
    const scene = scenesRef.current[index]
    if (scene?.id) {
      fetch(`/api/scenes/${scene.id}`, { method: "DELETE" }).catch(() => {})
    }
    setScenes((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const pollScene = useCallback(async (sceneId: string): Promise<Record<string, unknown>> => {
    while (true) {
      await new Promise((r) => setTimeout(r, 5000))
      const res = await fetch(`/api/scenes/${sceneId}`)
      if (!res.ok) continue
      const { scene } = await res.json()
      if (scene.generation_phase === "failed") throw new Error("Scene generation failed")
      if (scene.video_clip_url) return scene
    }
  }, [])

  const runScene = useCallback(async (index: number): Promise<"done" | "failed" | "limit"> => {
    const scene = scenesRef.current[index]
    if (!scene) return "failed"

    updateScene(index, { status: "processing", videoClipUrl: null, audioUrl: null, imageUrl: null })

    try {
      let sceneId = scene.id

      if (!sceneId) {
        const res = await fetch(`/api/projects/${projectId}/scenes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenes: [{ description: scene.description, voice_script: scene.voiceScript || undefined, order_index: index, duration_seconds: scene.durationSeconds }],
          }),
        })
        if (!res.ok) { updateScene(index, { status: "failed" }); return "failed" }
        const { scenes: [created] } = await res.json()
        sceneId = created.id
        updateScene(index, { id: sceneId })
      } else {
        // Sync description changes before regenerating
        await fetch(`/api/scenes/${sceneId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ description: scene.description, voiceScript: scene.voiceScript || null, durationSeconds: scene.durationSeconds }),
        }).catch(() => {})
      }

      const genRes = await fetch(`/api/scenes/${sceneId}/generate`, { method: "POST" })
      if (!genRes.ok) {
        const data = await genRes.json().catch(() => ({}))
        if (genRes.status === 429) {
          setError(`Daily scene limit reached (${data.used ?? "?"}/${data.limit ?? "?"}).`)
          updateScene(index, { status: "idle" })
          setLimitReached(true)
          setSceneQuota((q) => q ? { ...q, used: data.used ?? q.used } : q)
          return "limit"
        }
        // 422 = content moderation (show the reason); other errors show friendly fallback
        const apiMsg = (data as { error?: string }).error ?? ""
        setError(genRes.status === 422 ? apiMsg : `Scene ${index + 1} failed to generate. Please try again.`)
        updateScene(index, { status: "failed" })
        return "failed"
      }

      const done = await pollScene(sceneId!)
      updateScene(index, {
        status: "succeeded",
        imageUrl: (done.image_url as string) ?? null,
        videoClipUrl: (done.video_clip_url as string) ?? null,
        audioUrl: (done.audio_url as string) ?? null,
      })
      setSceneQuota((q) => q && !q.unlimited ? { ...q, used: q.used + 1 } : q)
      return "done"
    } catch {
      updateScene(index, { status: "failed" })
      setError(`Scene ${index + 1} failed to generate. Please try again.`)
      return "failed"
    }
  }, [projectId, updateScene, pollScene])

  const generateOne = useCallback(async (index: number) => {
    if (generating) return
    setError(null)
    setGenerating(true)
    setCurrentSceneIndex(index)
    await runScene(index)
    setGenerating(false)
    setCurrentSceneIndex(null)
  }, [generating, runScene])

  const generateAllRemaining = useCallback(async () => {
    setError(null)
    setGenerating(true)

    const toProcess = scenesRef.current
      .map((s, i) => ({ ...s, _index: i }))
      .filter((s) => !s.videoClipUrl && s.description.trim())

    toProcess.forEach(({ _index }) => updateScene(_index, { status: "pending" }))

    try {
      for (const { _index } of toProcess) {
        setCurrentSceneIndex(_index)
        const result = await runScene(_index)
        if (result === "limit") break
      }
    } finally {
      setGenerating(false)
      setCurrentSceneIndex(null)
    }
  }, [updateScene, runScene])

  const generateFinalVideo = useCallback(async () => {
    setError(null)
    setStitching(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/stitch`, { method: "POST" })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? "Stitch failed")
      }
      const { project } = await res.json()
      setFinalVideoUrl(project.final_video_url)
    } catch {
      setError("Failed to combine your scenes into a final video. Please try again.")
    } finally {
      setStitching(false)
    }
  }, [projectId])

  const remaining = scenes.filter((s) => !s.videoClipUrl && s.description.trim())
  const allScenesHaveClips = scenes.length > 0 && scenes.every((s) => s.videoClipUrl)
  const progressPercent = currentSceneIndex !== null ? Math.round(((currentSceneIndex + 1) / scenes.length) * 100) : 0

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-50">
      <Nav breadcrumbs={[{ label: title, href: `/studio/${projectId}` }]} />
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="hidden md:flex md:w-72 shrink-0 border-r border-zinc-200 bg-white flex-col overflow-y-auto">
          <div className="p-6 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-4">Character</h2>
            {loading && <div className="h-40 rounded-xl bg-zinc-100 animate-pulse" />}
            {!loading && !character && <p className="text-sm text-zinc-400">No character selected.</p>}
            {character && (
              <Card className="overflow-hidden">
                {(character.selected_style_url || character.source_photo_url) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={character.selected_style_url ?? character.source_photo_url}
                    alt={character.name}
                    className="w-full h-40 object-cover"
                    onError={(e) => {
                      const img = e.currentTarget
                      if (img.src !== character.source_photo_url && character.source_photo_url) img.src = character.source_photo_url
                    }}
                  />
                )}
                <CardContent className="p-4">
                  <p className="font-semibold text-zinc-900">{character.name}</p>
                  {character.lora_training_status && <p className="text-xs text-zinc-400 mt-1">LoRA: {character.lora_training_status}</p>}
                </CardContent>
              </Card>
            )}
          </div>

          {voiceId && (
            <div className="p-6 border-b border-zinc-100">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">Voice</h2>
              <Badge variant="secondary">Voice enabled</Badge>
            </div>
          )}

          <div className="p-6 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">Scenes</h2>
            <p className="text-zinc-700 font-semibold text-2xl">{scenes.length}</p>
            <p className="text-xs text-zinc-400">of {MAX_SCENES} max</p>

            {sceneQuota && (
              <div className={`mt-3 rounded-lg px-3 py-2.5 ${sceneQuota.unlimited ? "bg-violet-50" : limitReached ? "bg-red-50" : "bg-zinc-50"}`}>
                {sceneQuota.unlimited ? (
                  <p className="text-xs font-medium text-violet-600">Unlimited scenes — Super User</p>
                ) : (
                  <>
                    <p className="text-xs font-semibold text-zinc-700">
                      {sceneQuota.used} of {sceneQuota.limit} scenes used today
                    </p>
                    <p className={`text-xs mt-0.5 ${limitReached ? "text-red-500 font-medium" : "text-zinc-400"}`}>
                      {limitReached
                        ? "Daily limit reached · resets at midnight UTC"
                        : `${(sceneQuota.limit ?? 0) - sceneQuota.used} remaining · resets at midnight UTC`}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="p-6">
            <DeleteButton
              url={`/api/projects/${projectId}`}
              redirectTo="/dashboard"
              className="w-full text-zinc-400 hover:text-red-500 hover:bg-red-50 border border-zinc-200"
            />
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="border-b border-zinc-200 bg-white px-4 md:px-8 py-4 md:py-5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Label htmlFor="project-title" className="sr-only">Project title</Label>
              <Input
                id="project-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-base md:text-lg font-semibold border-0 shadow-none px-0 focus-visible:ring-0 bg-transparent"
                placeholder="Project title..."
              />
            </div>

            <div className="hidden md:flex items-center gap-3 shrink-0">
              {!finalVideoUrl && remaining.length > 0 && (
                <Button onClick={generateAllRemaining} disabled={generating || stitching || limitReached || scenes.every((s) => s.description.trim() === "")}>
                  {generating ? "Generating..." : `Generate ${remaining.length} Scene${remaining.length !== 1 ? "s" : ""}`}
                </Button>
              )}
            </div>
          </div>

          {/* Final video player + export/share */}
          {finalVideoUrl && (
            <>
              <div className="bg-black shrink-0">
                <video src={finalVideoUrl} controls className="max-h-64 mx-auto" />
              </div>
              <div className="bg-zinc-50 border-b border-zinc-200 px-4 md:px-8 py-4 shrink-0">
                <div className="flex flex-wrap gap-6">
                  {/* Download */}
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Download</p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={finalVideoUrl}
                        download
                        className="inline-flex flex-col items-start px-3 py-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 transition-colors text-sm font-medium text-zinc-800"
                      >
                        Landscape 16:9
                        <span className="text-xs font-normal text-zinc-400">YouTube · Facebook · X</span>
                      </a>
                      <a
                        href={`/api/projects/${projectId}/export?format=vertical`}
                        download
                        className="inline-flex flex-col items-start px-3 py-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 transition-colors text-sm font-medium text-zinc-800"
                      >
                        Vertical 9:16
                        <span className="text-xs font-normal text-zinc-400">Shorts · Reels · TikTok</span>
                      </a>
                    </div>
                  </div>
                  {/* Share */}
                  <div>
                    <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Share link</p>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`https://twitter.com/intent/tweet?text=${encodeURIComponent("I made this AI cartoon video with @AtVeAnimation!")}&url=${encodeURIComponent(finalVideoUrl)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center h-9 px-3 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 transition-colors text-sm font-medium text-zinc-800"
                      >
                        X / Twitter
                      </a>
                      <a
                        href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(finalVideoUrl)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center h-9 px-3 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 transition-colors text-sm font-medium text-zinc-800"
                      >
                        Facebook
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Progress */}
          {(generating || stitching) && (
            <div className="bg-violet-50 border-b border-violet-200 px-4 md:px-8 py-4 shrink-0">
              <p className="text-sm font-medium text-violet-800 mb-2">
                {stitching ? "Stitching clips into final video..." : `Generating scene ${(currentSceneIndex ?? 0) + 1}...`}
              </p>
              <Progress value={stitching ? 90 : progressPercent} className="h-2" />
              {!stitching && (
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {scenes.map((s, i) => (
                    <div key={i} className={`h-2 w-8 rounded-full transition-colors ${
                      s.status === "succeeded" ? "bg-green-500" : s.status === "processing" ? "bg-violet-500 animate-pulse" : s.status === "failed" ? "bg-red-400" : "bg-zinc-200"
                    }`} />
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 border-b border-red-200 px-4 md:px-8 py-3 shrink-0 flex items-center justify-between gap-3">
              <p className="text-sm text-red-700">{error}</p>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0">×</button>
            </div>
          )}

          {/* All scenes ready banner */}
          {allScenesHaveClips && !generating && !finalVideoUrl && (
            <div className="bg-green-50 border-b border-green-200 px-4 md:px-8 py-4 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <CheckIcon className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-green-800">All {scenes.length} scene{scenes.length !== 1 ? "s" : ""} ready!</p>
                  <p className="text-xs text-green-600 hidden sm:block">Review your clips, then generate the final video.</p>
                </div>
              </div>
              <Button onClick={generateFinalVideo} disabled={stitching} className="bg-green-600 hover:bg-green-700 text-white shrink-0 gap-2">
                <PlayIcon className="w-4 h-4 shrink-0" />
                {stitching ? "Stitching..." : "Generate Final Video"}
              </Button>
            </div>
          )}

          {/* Scene list */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 space-y-3 pb-36 md:pb-6">
            {scenes.map((scene, index) => (
              <SceneCard
                key={index}
                index={index}
                scene={scene}
                disabled={generating || stitching}
                characterId={character?.id ?? null}
                onUpdate={(patch) => updateScene(index, patch)}
                onDelete={() => deleteScene(index)}
                onGenerate={() => generateOne(index)}
                showDelete={scenes.length > 1}
              />
            ))}

            {scenes.length < MAX_SCENES && !generating && (
              <button
                type="button"
                onClick={addScene}
                className="w-full py-4 border-2 border-dashed border-zinc-200 rounded-xl text-sm text-zinc-400 hover:border-violet-300 hover:text-violet-500 hover:bg-violet-50 transition-colors"
              >
                + Add Scene
              </button>
            )}
          </div>

          {/* Mobile bottom bar */}
          {!finalVideoUrl && (
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-zinc-200 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
              {sceneQuota && (
                <p className={`text-xs text-center mb-2 ${limitReached ? "text-red-500 font-medium" : sceneQuota.unlimited ? "text-violet-600 font-medium" : "text-zinc-400"}`}>
                  {sceneQuota.unlimited
                    ? "Unlimited scenes · Super User"
                    : limitReached
                    ? "Daily limit reached · resets midnight UTC"
                    : `${(sceneQuota.limit ?? 0) - sceneQuota.used} of ${sceneQuota.limit} scenes remaining today`}
                </p>
              )}
              <div className="flex gap-2">
                {allScenesHaveClips ? (
                  <Button onClick={generateFinalVideo} disabled={stitching} className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5">
                    <PlayIcon className="w-4 h-4 shrink-0" />
                    {stitching ? "Stitching..." : "Generate Final Video"}
                  </Button>
                ) : remaining.length > 0 ? (
                  <Button onClick={generateAllRemaining} disabled={generating || stitching || limitReached} className="flex-1">
                    {generating ? "Generating..." : `Generate ${remaining.length} Scene${remaining.length !== 1 ? "s" : ""}`}
                  </Button>
                ) : null}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}

// ── Scene card ────────────────────────────────────────────────────────────────

type SceneCardProps = {
  index: number
  scene: LocalScene
  disabled: boolean
  characterId: string | null
  onUpdate: (patch: Partial<LocalScene>) => void
  onDelete: () => void
  onGenerate: () => void
  showDelete: boolean
}

function SceneCard({ index, scene, disabled, characterId, onUpdate, onDelete, onGenerate, showDelete }: SceneCardProps) {
  const isProcessing = scene.status === "processing"
  const isDone = !!scene.videoClipUrl
  const isFailed = scene.status === "failed"
  const canGenerate = !disabled && !!characterId && scene.description.trim() !== ""

  return (
    <Card className={`overflow-hidden transition-shadow ${isDone ? "ring-1 ring-green-200" : isFailed ? "ring-1 ring-red-200" : ""}`}>
      <CardContent className="p-3 md:p-5">

        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono font-semibold text-zinc-400 bg-zinc-100 rounded px-2 py-0.5">
            Scene {index + 1}
          </span>
          {isDone && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 rounded-full px-2 py-0.5">
              <CheckIcon className="w-3 h-3" /> Done
            </span>
          )}
          {isFailed && <span className="text-xs font-medium text-red-600 bg-red-50 rounded-full px-2 py-0.5">Failed</span>}
          {isProcessing && <span className="text-xs font-medium text-violet-700 bg-violet-50 rounded-full px-2 py-0.5 animate-pulse">Generating...</span>}
          {scene.status === "pending" && <span className="text-xs font-medium text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">Queued</span>}
          <div className="flex-1" />
          {showDelete && (
            <button type="button" onClick={onDelete} disabled={isProcessing}
              className="text-zinc-300 hover:text-red-400 transition-colors text-xl leading-none disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Delete scene">×</button>
          )}
        </div>

        {isDone && scene.videoClipUrl && (
          <div className="mb-3">
            <video src={scene.videoClipUrl} controls className="w-full rounded-lg border border-zinc-200 max-h-48" />
            {scene.audioUrl && (
              <div className="mt-2">
                <p className="text-xs text-zinc-400 mb-1">Narration</p>
                <audio controls src={scene.audioUrl} className="w-full h-10" />
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div>
            <Label htmlFor={`desc-${index}`} className="text-xs text-zinc-500 mb-1 block">
              Scene description
              {isDone && <span className="text-zinc-400 font-normal ml-1">— edit and regenerate to update</span>}
            </Label>
            <Textarea
              id={`desc-${index}`}
              value={scene.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Describe what happens in this scene..."
              rows={isDone ? 2 : 3}
              disabled={isProcessing}
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Label htmlFor={`voice-${index}`} className="text-xs text-zinc-500 mb-1 block">
                Character narration
              </Label>
              <Textarea
                id={`voice-${index}`}
                value={scene.voiceScript}
                onChange={(e) => onUpdate({ voiceScript: e.target.value })}
                placeholder="What the character says. Leave blank to use scene description..."
                rows={2}
                disabled={isProcessing}
              />
              {(() => {
                const text = (scene.voiceScript || scene.description).trim()
                const words = text ? text.split(/\s+/).length : 0
                const estSecs = words / 2.2
                return estSecs > 6.5 ? (
                  <p className="text-xs text-amber-600 mt-1">
                    ~{Math.round(estSecs)}s of narration for a ~6s clip — audio will fade out to fit.
                  </p>
                ) : null
              })()}
            </div>
            <div>
              <Label className="text-xs text-zinc-500 mb-1 block">Clip length</Label>
              <p className="text-xs text-zinc-600 font-medium">~6 seconds</p>
              <p className="text-xs text-zinc-400 mt-0.5">Longer clips coming soon</p>
            </div>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          {isProcessing ? (
            <Button disabled size="sm" className="gap-2">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating...
            </Button>
          ) : isDone ? (
            <Button variant="outline" size="sm" onClick={onGenerate} disabled={!canGenerate}
              className="gap-1.5 text-zinc-600 hover:text-violet-700 hover:border-violet-300"
              title={!scene.description.trim() ? "Add a description first" : !characterId ? "No character selected" : "Regenerate with new description"}>
              <RefreshIcon className="w-3.5 h-3.5" />
              Regenerate
            </Button>
          ) : (
            <Button size="sm" onClick={onGenerate} disabled={!canGenerate}
              title={!scene.description.trim() ? "Add a description first" : !characterId ? "No character selected" : "Generate this scene"}>
              Generate Scene
            </Button>
          )}
        </div>

        {!isDone && !isProcessing && scene.description.trim() === "" && (
          <p className="text-xs text-zinc-400 mt-2 text-right">Write a description to enable generation</p>
        )}
      </CardContent>
    </Card>
  )
}
