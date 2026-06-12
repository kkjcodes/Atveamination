"use client"

import { Suspense } from "react"
import { useEffect, useState, useCallback, useRef } from "react"
import { orchestrateSceneGeneration } from "@/lib/studio/orchestrate"
import { useSearchParams } from "next/navigation"
import Nav from "@/components/nav"
import BriefModal from "@/components/brief-modal"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Character, JobStatus, Scene } from "@/types"

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

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  )
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
  return {
    id: null,
    description: "",
    voiceScript: "",
    durationSeconds: 5,
    status: "idle",
    imageUrl: null,
    videoClipUrl: null,
    audioUrl: null,
  }
}

type BriefScene = { description: string; voiceScript: string; durationSeconds: 5 | 10 | 15 }

const SCENE_COUNT_OPTIONS = [2, 3, 4, 5, 6, 8]

function StartModal({
  open,
  title,
  onTitleChange,
  characterStyle,
  onApply,
  onSkip,
}: {
  open: boolean
  title: string
  onTitleChange: (t: string) => void
  characterStyle?: string
  onApply: (scenes: BriefScene[]) => void
  onSkip: () => void
}) {
  const [brief, setBrief] = useState("")
  const [numScenes, setNumScenes] = useState(4)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  async function handleGenerate() {
    if (!brief.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, style: characterStyle, num_scenes: numScenes }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429 && data.resetsAt) {
          const h = Math.ceil((new Date(data.resetsAt).getTime() - Date.now()) / 3600000)
          throw new Error(`${data.error} (${data.used}/${data.limit} used · resets in ${h <= 1 ? "<1h" : `${h}h`})`)
        }
        throw new Error(data.error ?? "Failed to generate")
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onApply((data.scenes as any[]).map((s) => ({
        description: String(s.description ?? ""),
        voiceScript: String(s.voice_script ?? ""),
        durationSeconds: ([5, 10, 15] as const).includes(s.duration_seconds) ? s.duration_seconds : 5,
      })))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl mx-4 flex flex-col max-h-[90vh]">

        <div className="px-7 pt-7 pb-3">
          <h2 className="text-2xl font-bold text-zinc-900">Let&apos;s make your video</h2>
          <p className="text-sm text-zinc-400 mt-1">Give it a name, describe your idea, and AI will write the scenes for you</p>
        </div>

        <div className="px-7 pb-6 space-y-5 overflow-y-auto">
          {/* Title */}
          <div>
            <Label htmlFor="start-title" className="text-sm font-medium text-zinc-700 mb-1.5 block">Video title</Label>
            <Input
              id="start-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="e.g. My Adventure in Tokyo"
              autoFocus
            />
          </div>

          {/* AI script section */}
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <SparkleIcon className="w-4 h-4 text-violet-500 shrink-0" />
              <p className="text-sm font-semibold text-violet-800">Generate your script with AI</p>
            </div>

            <div>
              <Label htmlFor="start-brief" className="text-xs font-medium text-zinc-600 mb-1.5 block">
                What&apos;s your video about?
              </Label>
              <Textarea
                id="start-brief"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="e.g. A fun 30-second clip where my character wakes up, makes coffee, and heads out on a city adventure. Upbeat and energetic."
                rows={4}
                className="resize-none bg-white"
                disabled={loading}
              />
              <p className="text-xs text-zinc-400 mt-1.5">
                Include mood, setting, key moments — the more detail, the better the output.
              </p>
            </div>

            <div>
              <Label className="text-xs font-medium text-zinc-600 mb-1.5 block">Number of scenes</Label>
              <div className="flex gap-2">
                {SCENE_COUNT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setNumScenes(n)}
                    disabled={loading}
                    className={`h-8 w-9 text-sm rounded-lg border font-medium transition-colors ${
                      numScenes === n
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                    } disabled:opacity-50`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

            <Button
              onClick={handleGenerate}
              disabled={loading || !brief.trim()}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0 gap-2"
              size="lg"
            >
              <SparkleIcon className="w-4 h-4 shrink-0" />
              {loading ? "Writing your script…" : "Generate script with AI"}
            </Button>
          </div>
        </div>

        <div className="px-7 py-4 border-t border-zinc-100 flex justify-center">
          <button
            type="button"
            onClick={onSkip}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            I&apos;ll write my scenes manually →
          </button>
        </div>
      </div>
    </div>
  )
}

function StudioContent() {
  const searchParams = useSearchParams()
  const characterId = searchParams.get("character")
  const voiceId = searchParams.get("voice")

  const [character, setCharacter] = useState<Character | null>(null)
  const [characterLoading, setCharacterLoading] = useState(true)
  const [title, setTitle] = useState("Untitled Video")
  const [scenes, setScenes] = useState<LocalScene[]>([makeLocalScene()])
  const [projectId, setProjectId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [currentSceneIndex, setCurrentSceneIndex] = useState<number | null>(null)
  const [stitching, setStitching] = useState(false)
  const [finalVideoUrl, setFinalVideoUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [briefModalOpen, setBriefModalOpen] = useState(false)
  const [startModalOpen, setStartModalOpen] = useState(true)

  // Refs so async callbacks always read the latest value without stale closures
  const scenesRef = useRef(scenes)
  useEffect(() => { scenesRef.current = scenes }, [scenes])

  const projectIdRef = useRef<string | null>(projectId)
  useEffect(() => { projectIdRef.current = projectId }, [projectId])

  type UsageLimits = { used: number; limit: number; resetsAt: string | null }
  const [sceneUsage, setSceneUsage] = useState<UsageLimits | null>(null)

  useEffect(() => {
    fetch("/api/limits").then((r) => r.json()).then((d) => setSceneUsage(d.scenes)).catch(() => {})
  }, [])

  // Debounced title save
  useEffect(() => {
    if (!projectId || !title.trim()) return
    const t = setTimeout(() => {
      fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      }).catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [title, projectId])

  function formatReset(resetsAt: string | null): string {
    if (!resetsAt) return ""
    const diff = new Date(resetsAt).getTime() - Date.now()
    const h = Math.ceil(diff / 1000 / 60 / 60)
    return h <= 1 ? "resets in <1h" : `resets in ${h}h`
  }

  useEffect(() => {
    if (!characterId) { setCharacterLoading(false); return }
    fetch(`/api/characters/${characterId}`)
      .then((r) => r.json())
      .then((data) => setCharacter(data.character ?? null))
      .catch(() => null)
      .finally(() => setCharacterLoading(false))
  }, [characterId])

  const updateScene = useCallback((index: number, patch: Partial<LocalScene>) => {
    setScenes((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }, [])

  const addScene = useCallback(() => {
    setScenes((prev) => (prev.length < MAX_SCENES ? [...prev, makeLocalScene()] : prev))
  }, [])

  const deleteScene = useCallback(async (index: number) => {
    const scene = scenesRef.current[index]
    if (scene?.id) {
      // Fire and forget — don't block the UI
      fetch(`/api/scenes/${scene.id}`, { method: "DELETE" }).catch(() => {})
    }
    setScenes((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const ensureProject = useCallback(async (): Promise<string> => {
    // Read from ref, not state — state updates are async and won't be visible
    // to subsequent calls within the same async chain (stale closure).
    if (projectIdRef.current) return projectIdRef.current
    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character_id: characterId, voice_id: voiceId, title }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? "Failed to create project")
    }
    const { project } = await res.json()
    projectIdRef.current = project.id  // update ref immediately so next call sees it
    setProjectId(project.id)
    return project.id
  }, [characterId, voiceId, title])

  const pollScene = useCallback(async (sceneId: string): Promise<Scene> => {
    while (true) {
      await new Promise((r) => setTimeout(r, 5000))
      const res = await fetch(`/api/scenes/${sceneId}`)
      if (!res.ok) continue
      const { scene } = await res.json()
      if (scene.generation_phase === "failed") throw new Error("Scene generation failed")
      if (scene.generation_phase === "done") return scene
    }
  }, [])

  // Polls until scene 1's keyframe image is stored — faster interval than
  // pollScene since we only need to unblock scenes 2-N, not wait for video.
  const pollUntilImageReady = useCallback(async (sceneId: string): Promise<void> => {
    while (true) {
      await new Promise((r) => setTimeout(r, 3000))
      const res = await fetch(`/api/scenes/${sceneId}`)
      if (!res.ok) continue
      const { scene } = await res.json()
      if (scene.generation_phase === "failed") throw new Error("Scene generation failed")
      if (scene.image_url) return
    }
  }, [])

  // Core: ensure a scene has a DB record, then trigger generation and poll.
  // Returns "done", "failed", or "limit" (caller should stop bulk generation).
  const runScene = useCallback(async (index: number): Promise<"done" | "failed" | "limit"> => {
    const scene = scenesRef.current[index]
    if (!scene) return "failed"

    updateScene(index, { status: "processing", videoClipUrl: null, audioUrl: null, imageUrl: null })

    try {
      const pid = await ensureProject()
      let sceneId = scene.id

      if (!sceneId) {
        const res = await fetch(`/api/projects/${pid}/scenes`, {
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
        // Regenerating an existing scene — sync description changes to DB first
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
          setError(`Daily scene limit reached (${data.used ?? "?"}/${data.limit ?? "?"}). ${formatReset(data.resetsAt)}`)
          setSceneUsage((prev) => prev ? { ...prev, used: data.used ?? prev.used } : prev)
          updateScene(index, { status: "idle" })
          return "limit"
        }
        const msg = (await genRes.json().catch(() => ({})) as { error?: string }).error
        setError(msg ?? "Generation failed")
        updateScene(index, { status: "failed" })
        return "failed"
      }

      setSceneUsage((prev) => prev ? { ...prev, used: prev.used + 1 } : prev)

      const done = await pollScene(sceneId!)
      updateScene(index, {
        status: "succeeded",
        imageUrl: done.image_url ?? null,
        videoClipUrl: done.video_clip_url ?? null,
        audioUrl: done.audio_url ?? null,
      })
      return "done"
    } catch {
      updateScene(index, { status: "failed" })
      return "failed"
    }
  }, [ensureProject, updateScene, pollScene, formatReset])

  // Single-scene generate (per-scene button)
  const generateOne = useCallback(async (index: number) => {
    if (generating) return
    setError(null)
    setGenerating(true)
    setCurrentSceneIndex(index)
    await runScene(index)
    setGenerating(false)
    setCurrentSceneIndex(null)
  }, [generating, runScene])

  // Bulk: creates all DB records first, then generates with scene 1 as anchor.
  // Scene 1's keyframe is generated first; once its imageUrl is in the DB,
  // scenes 2-N start in parallel — they reference scene 1 for character consistency.
  // All scenes appear as "generating" in the UI from the start.
  // Server drives completion via webhooks even if the user leaves the page.
  const generateAllRemaining = useCallback(async () => {
    setError(null)
    setGenerating(true)

    const snapshot = scenesRef.current
    const toProcess = snapshot
      .map((s, i) => ({ ...s, _index: i }))
      .filter((s) => !s.videoClipUrl && s.description.trim())

    if (toProcess.length === 0) { setGenerating(false); return }

    // Show all scenes as generating immediately — the anchor wait is invisible to the user
    toProcess.forEach(({ _index }) => updateScene(_index, { status: "processing" }))

    try {
      const pid = await ensureProject()

      // Step 1: Create all DB records upfront in parallel so they exist immediately.
      // If the user leaves, the server can still complete them via webhooks.
      const withIds = await Promise.all(
        toProcess.map(async (item) => {
          const { _index, id, description, voiceScript, durationSeconds } = item
          if (id) {
            await fetch(`/api/scenes/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ description, voiceScript: voiceScript || null, durationSeconds }),
            }).catch(() => {})
            return { ...item, resolvedId: id }
          }
          const res = await fetch(`/api/projects/${pid}/scenes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scenes: [{ description, voice_script: voiceScript || undefined, order_index: _index, duration_seconds: durationSeconds }],
            }),
          })
          if (!res.ok) return { ...item, resolvedId: null as string | null }
          const { scenes: [created] } = await res.json()
          updateScene(_index, { id: created.id })
          return { ...item, resolvedId: created.id as string }
        })
      )

      const valid = withIds.filter((x) => x.resolvedId !== null)
      if (valid.length === 0) return

      // Step 2-4 handled by orchestrate: scene 1 keyframe first → then rest in parallel
      await orchestrateSceneGeneration(
        valid.map(({ resolvedId, _index }) => ({ sceneId: resolvedId!, orderIndex: _index })),
        {
          startGeneration: async (sceneId) => {
            const item = valid.find((x) => x.resolvedId === sceneId)!
            const genRes = await fetch(`/api/scenes/${sceneId}/generate`, { method: "POST" })
            if (!genRes.ok) {
              const data = await genRes.json().catch(() => ({})) as { error?: string; used?: number; limit?: number; resetsAt?: string }
              if (genRes.status === 429) {
                setError(`Daily scene limit reached (${data.used ?? "?"}/${data.limit ?? "?"}). ${formatReset(data.resetsAt ?? null)}`)
                setSceneUsage((prev) => prev ? { ...prev, used: data.used ?? prev.used } : prev)
                updateScene(item._index, { status: "idle" })
              } else {
                setError(data.error ?? "Generation failed")
                updateScene(item._index, { status: "failed" })
              }
            } else {
              setSceneUsage((prev) => prev ? { ...prev, used: prev.used + 1 } : prev)
            }
          },
          pollImageReady: pollUntilImageReady,
          pollDone: async (sceneId) => {
            const item = valid.find((x) => x.resolvedId === sceneId)!
            const current = scenesRef.current[item._index]
            if (current.status === "failed" || current.status === "idle") return
            try {
              const done = await pollScene(sceneId)
              updateScene(item._index, {
                status: "succeeded",
                imageUrl: done.image_url ?? null,
                videoClipUrl: done.video_clip_url ?? null,
                audioUrl: done.audio_url ?? null,
              })
            } catch {
              updateScene(item._index, { status: "failed" })
            }
          },
        }
      )
    } catch {
      // Individual errors are handled inside callbacks; catch here to unblock finally
    } finally {
      setGenerating(false)
      setCurrentSceneIndex(null)
    }
  }, [ensureProject, updateScene, pollScene, pollUntilImageReady, formatReset])

  const generateFinalVideo = useCallback(async () => {
    if (!projectId) return
    setError(null)
    setStitching(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/stitch`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Stitch failed")
      }
      const { project } = await res.json()
      setFinalVideoUrl(project.final_video_url)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stitch failed")
    } finally {
      setStitching(false)
    }
  }, [projectId])

  const applyBriefScenes = useCallback(
    (briefScenes: Array<{ description: string; voiceScript: string; durationSeconds: 5 | 10 | 15 }>) => {
      setScenes(briefScenes.map((s) => ({ ...makeLocalScene(), ...s })))
    },
    []
  )

  function handleStartApply(scenes: BriefScene[]) {
    applyBriefScenes(scenes)
    setStartModalOpen(false)
  }

  const remaining = scenes.filter((s) => !s.videoClipUrl && s.description.trim())
  const allScenesHaveClips = scenes.length > 0 && scenes.every((s) => s.videoClipUrl)
  const atLimit = sceneUsage !== null && sceneUsage.used >= sceneUsage.limit

  const progressPercent =
    currentSceneIndex !== null ? Math.round(((currentSceneIndex + 1) / scenes.length) * 100) : 0

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-50">
      <Nav breadcrumbs={[{ label: "New Video" }]} />
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar — hidden on mobile */}
        <aside className="hidden md:flex md:w-72 shrink-0 border-r border-zinc-200 bg-white flex-col overflow-y-auto">
          <div className="p-6 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-4">Character</h2>
            {characterLoading && <div className="h-40 rounded-xl bg-zinc-100 animate-pulse" />}
            {!characterLoading && !character && <p className="text-sm text-zinc-400">No character selected.</p>}
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
              <Badge variant="secondary">Voice #{voiceId.slice(0, 8)}</Badge>
            </div>
          )}

          <div className="p-6">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-2">Scenes</h2>
            <p className="text-zinc-700 font-semibold text-2xl">{scenes.length}</p>
            <p className="text-xs text-zinc-400">of {MAX_SCENES} max</p>
          </div>

          {sceneUsage && (
            <div className="px-6 pb-6">
              <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-3">Today&apos;s usage</h2>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-600">Scenes generated</span>
                  <span className={`font-semibold tabular-nums ${atLimit ? "text-red-600" : sceneUsage.used >= sceneUsage.limit * 0.8 ? "text-amber-600" : "text-zinc-700"}`}>
                    {sceneUsage.used} / {sceneUsage.limit}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${atLimit ? "bg-red-500" : sceneUsage.used >= sceneUsage.limit * 0.8 ? "bg-amber-400" : "bg-violet-500"}`}
                    style={{ width: `${Math.min(100, (sceneUsage.used / sceneUsage.limit) * 100)}%` }}
                  />
                </div>
                {sceneUsage.resetsAt && <p className="text-xs text-zinc-400">{formatReset(sceneUsage.resetsAt)}</p>}
                {atLimit && <p className="text-xs text-red-600 font-medium pt-0.5">Limit reached</p>}
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Header */}
          <div className="border-b border-zinc-200 bg-white px-4 md:px-8 py-4 md:py-5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Label htmlFor="project-title" className="text-xs text-zinc-400 mb-0.5 block">Video title</Label>
              <Input
                id="project-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-base md:text-lg font-semibold border-0 border-b border-zinc-200 rounded-none shadow-none px-0 focus-visible:ring-0 bg-transparent hover:border-violet-300 focus:border-violet-500 transition-colors"
                placeholder="Name your video..."
              />
            </div>

            {/* Desktop buttons */}
            <div className="hidden md:flex items-center gap-3 shrink-0">
              {finalVideoUrl ? (
                <a href={finalVideoUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center h-10 px-4 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors">
                  Download Video
                </a>
              ) : (
                <>
                  <Button
                    onClick={() => setBriefModalOpen(true)}
                    disabled={generating || stitching}
                    className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0 shadow-sm shadow-violet-200 gap-2"
                  >
                    <SparkleIcon className="w-4 h-4 shrink-0" />
                    Generate Script
                  </Button>
                  {!allScenesHaveClips && remaining.length > 0 && (
                    <Button onClick={generateAllRemaining} disabled={generating || stitching || !characterId || atLimit}
                      title={atLimit ? `Daily limit reached (${sceneUsage?.used}/${sceneUsage?.limit})` : undefined}>
                      {generating ? "Generating..." : `Generate ${remaining.length} Scene${remaining.length !== 1 ? "s" : ""}`}
                    </Button>
                  )}
                </>
              )}
            </div>

            {finalVideoUrl && (
              <a href={finalVideoUrl} target="_blank" rel="noopener noreferrer"
                className="md:hidden inline-flex items-center h-9 px-3 rounded-lg bg-green-600 text-white text-sm font-medium">
                Download
              </a>
            )}
          </div>

          {/* Progress bar */}
          {(generating || stitching) && (
            <div className="bg-violet-50 border-b border-violet-200 px-4 md:px-8 py-4 shrink-0">
              <p className="text-sm font-medium text-violet-800 mb-2">
                {stitching
                  ? "Stitching clips into final video..."
                  : currentSceneIndex !== null
                    ? `Generating scene ${currentSceneIndex + 1}...`
                    : `Generating ${scenes.filter((s) => s.status === "processing" || s.status === "pending").length} scene${scenes.filter((s) => s.status === "processing" || s.status === "pending").length !== 1 ? "s" : ""}...`}
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
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-green-800">All {scenes.length} scene{scenes.length !== 1 ? "s" : ""} ready!</p>
                  <p className="text-xs text-green-600 hidden sm:block">Review the clips below, then generate your final video.</p>
                </div>
              </div>
              <Button onClick={generateFinalVideo} disabled={stitching} className="bg-green-600 hover:bg-green-700 text-white shrink-0 gap-2">
                <PlayIcon className="w-4 h-4 shrink-0" />
                {stitching ? "Stitching..." : "Generate Final Video"}
              </Button>
            </div>
          )}

          {/* Scene list */}
          <div className="flex-1 overflow-y-auto px-4 md:px-8 py-4 md:py-6 space-y-3 pb-28 md:pb-6">

            {scenes.length === 0 && (
              <div className="text-center py-16 text-zinc-400">
                <p className="text-sm">No scenes yet. Use &quot;Generate Script&quot; above to write scenes with AI, or add a scene below.</p>
              </div>
            )}

            {scenes.map((scene, index) => (
              <SceneCard
                key={index}
                index={index}
                scene={scene}
                disabled={generating || stitching}
                atLimit={atLimit}
                characterId={characterId}
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
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-white border-t border-zinc-200 px-4 py-3 flex gap-2">
              <Button
                onClick={() => setBriefModalOpen(true)}
                disabled={generating || stitching}
                className="flex-1 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0 gap-1.5"
              >
                <SparkleIcon className="w-4 h-4 shrink-0" />
                Generate Script
              </Button>
              {allScenesHaveClips ? (
                <Button onClick={generateFinalVideo} disabled={stitching} className="flex-1 bg-green-600 hover:bg-green-700 text-white gap-1.5">
                  <PlayIcon className="w-4 h-4 shrink-0" />
                  {stitching ? "Stitching..." : "Final Video"}
                </Button>
              ) : remaining.length > 0 ? (
                <Button onClick={generateAllRemaining} disabled={generating || stitching || !characterId || atLimit} className="flex-1">
                  {generating ? "Generating..." : `Generate ${remaining.length}`}
                </Button>
              ) : null}
            </div>
          )}
        </main>
      </div>

      <StartModal
        open={startModalOpen}
        title={title}
        onTitleChange={setTitle}
        characterStyle={character?.selected_style ?? undefined}
        onApply={handleStartApply}
        onSkip={() => setStartModalOpen(false)}
      />

      <BriefModal
        open={briefModalOpen}
        onClose={() => setBriefModalOpen(false)}
        onApply={applyBriefScenes}
        characterStyle={character?.selected_style ?? undefined}
      />
    </div>
  )
}

// ── Scene card component ──────────────────────────────────────────────────────

type SceneCardProps = {
  index: number
  scene: LocalScene
  disabled: boolean
  atLimit: boolean
  characterId: string | null
  onUpdate: (patch: Partial<LocalScene>) => void
  onDelete: () => void
  onGenerate: () => void
  showDelete: boolean
}

function SceneCard({ index, scene, disabled, atLimit, characterId, onUpdate, onDelete, onGenerate, showDelete }: SceneCardProps) {
  const isProcessing = scene.status === "processing"
  const isDone = !!scene.videoClipUrl
  const isFailed = scene.status === "failed"
  const canGenerate = !disabled && !atLimit && !!characterId && scene.description.trim() !== ""

  return (
    <Card className={`overflow-hidden transition-shadow ${isDone ? "ring-1 ring-green-200" : isFailed ? "ring-1 ring-red-200" : ""}`}>
      <CardContent className="p-3 md:p-5">

        {/* Card header: number + status + delete */}
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-mono font-semibold text-zinc-400 bg-zinc-100 rounded px-2 py-0.5">
            Scene {index + 1}
          </span>
          {isDone && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 rounded-full px-2 py-0.5">
              <CheckIcon className="w-3 h-3" /> Done
            </span>
          )}
          {isFailed && (
            <span className="text-xs font-medium text-red-600 bg-red-50 rounded-full px-2 py-0.5">Failed</span>
          )}
          {isProcessing && (
            <span className="text-xs font-medium text-violet-700 bg-violet-50 rounded-full px-2 py-0.5 animate-pulse">Generating...</span>
          )}
          {scene.status === "pending" && (
            <span className="text-xs font-medium text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">Queued</span>
          )}
          <div className="flex-1" />
          {showDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isProcessing}
              className="text-zinc-300 hover:text-red-400 transition-colors text-xl leading-none disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Delete scene"
            >
              ×
            </button>
          )}
        </div>

        {/* Generated clip (shown above description when done) */}
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

        {/* Description + narration fields */}
        <div className="space-y-3">
          <div>
            <Label htmlFor={`desc-${index}`} className="text-xs text-zinc-500 mb-1 block">
              Scene description
              {isDone && <span className="text-zinc-400 font-normal ml-1">— edit below and regenerate to update</span>}
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
                <span className="text-zinc-400 font-normal ml-1 hidden sm:inline">— what the character says</span>
              </Label>
              <Textarea
                id={`voice-${index}`}
                value={scene.voiceScript}
                onChange={(e) => onUpdate({ voiceScript: e.target.value })}
                placeholder="Leave blank to use the scene description..."
                rows={2}
                disabled={isProcessing}
              />
            </div>

            <div>
              <Label className="text-xs text-zinc-500 mb-1 block">Duration</Label>
              <div className="flex gap-1">
                {([5, 10, 15] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => onUpdate({ durationSeconds: d })}
                    disabled={isProcessing}
                    className={`h-9 px-3 text-sm rounded-lg border font-medium transition-colors ${
                      scene.durationSeconds === d
                        ? "bg-violet-600 text-white border-violet-600"
                        : "bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {d}s
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Per-scene action button */}
        <div className="mt-3 flex justify-end">
          {isProcessing ? (
            <Button disabled size="sm" className="gap-2">
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Generating...
            </Button>
          ) : isDone ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerate}
              disabled={!canGenerate}
              className="gap-1.5 text-zinc-600 hover:text-violet-700 hover:border-violet-300"
              title={!scene.description.trim() ? "Add a description first" : atLimit ? "Daily limit reached" : !characterId ? "No character selected" : "Regenerate this scene with the current description"}
            >
              <RefreshIcon className="w-3.5 h-3.5" />
              Regenerate
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onGenerate}
              disabled={!canGenerate}
              title={!scene.description.trim() ? "Add a description first" : atLimit ? "Daily limit reached" : !characterId ? "No character selected" : "Generate this scene"}
            >
              Generate Scene
            </Button>
          )}
        </div>

        {/* Hints */}
        {!isDone && !isProcessing && scene.description.trim() === "" && (
          <p className="text-xs text-zinc-400 mt-2 text-right">Write a description to enable generation</p>
        )}
        {!characterId && !isDone && (
          <p className="text-xs text-amber-600 mt-2 text-right">Select a character first</p>
        )}
      </CardContent>
    </Card>
  )
}

export default function NewProjectPage() {
  return (
    <Suspense>
      <StudioContent />
    </Suspense>
  )
}
