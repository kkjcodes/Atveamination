"use client"

import { Suspense } from "react"
import { useEffect, useState, useCallback, useRef, useMemo } from "react"
import { orchestrateSceneGeneration } from "@/lib/studio/orchestrate"
import { assignSceneFocus } from "@/lib/storyboard"
import { PRESET_SCENES } from "@/lib/presets/scenes"
import { detectMultiCharScene, hasRelationalCues } from "@/lib/scene-routing"
import { useSearchParams } from "next/navigation"
import Nav from "@/components/nav"
import BriefModal from "@/components/brief-modal"
import ShareButtons from "@/components/share-buttons"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Character, JobStatus, Scene } from "@/types"

const MAX_SCENES = 100
const MAX_CHARACTERS = 4

type LocalScene = {
  id: string | null
  description: string
  voiceScript: string
  durationSeconds: 5 | 10 | 15
  status: JobStatus | "idle"
  imageUrl: string | null
  videoClipUrl: string | null
  audioUrl: string | null
  // Propagated from preset scenes; null/undefined for AI-generated briefs.
  // "shared" forces multi-Kontext (focus_character_id=null) so we don't render
  // the same LoRA character twice when a scene needs two distinct people.
  focusRole?: "primary" | "secondary" | "shared" | "any"
  // Speaker name from the AI brief (one of the project character names).
  // Resolved to a character ID at scene-save time so audio uses the right voice.
  speakerName?: string
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

type BriefScene = {
  description: string
  voiceScript: string
  durationSeconds: 5 | 10 | 15
  // "shared" means the scene shows multiple characters together — must route
  // through Multi-Kontext, not single-character LoRA, to avoid duplicating one
  // character to fill both subject slots in the prompt. Optional: AI-generated
  // briefs leave this undefined and storyboard auto-assigns focus.
  focusRole?: "primary" | "secondary" | "shared" | "any"
  // Which character is delivering the voice line. From the AI brief, optional
  // for single-character projects.
  speakerName?: string
}

const SCENE_COUNT_OPTIONS = [2, 3, 4, 5, 6, 8]

type CharSummary = Pick<Character, "id" | "name" | "selected_style_url" | "source_photo_url" | "selected_style">

function CharacterPill({ char, onRemove }: { char: CharSummary; onRemove?: () => void }) {
  const imgUrl = char.selected_style_url ?? char.source_photo_url ?? null
  return (
    <div className="flex items-center gap-1.5 bg-zinc-100 rounded-full pl-1 pr-2.5 py-1">
      {imgUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imgUrl} alt={char.name} className="w-6 h-6 rounded-full object-cover shrink-0" />
      ) : (
        <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center shrink-0 text-xs">👤</div>
      )}
      <span className="text-sm font-medium text-zinc-800 truncate max-w-[120px]">{char.name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} className="ml-0.5 text-zinc-400 hover:text-zinc-600 text-lg leading-none">&times;</button>
      )}
    </div>
  )
}

function StartModal({
  open,
  title,
  onTitleChange,
  selectedCharIds,
  onSelectedCharIdsChange,
  allUserChars,
  onApply,
  onSkip,
}: {
  open: boolean
  title: string
  onTitleChange: (t: string) => void
  selectedCharIds: string[]
  onSelectedCharIdsChange: (ids: string[]) => void
  allUserChars: CharSummary[]
  onApply: (scenes: BriefScene[]) => void
  onSkip: () => void
}) {
  const [brief, setBrief] = useState("")
  const [numScenes, setNumScenes] = useState(4)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPresets, setShowPresets] = useState(false)
  const [activeTag, setActiveTag] = useState("all")
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([])

  if (!open) return null

  const PRESET_TAGS = ["all", "everyday", "adventure", "celebration", "heartfelt", "travel", "fun"]
  const filteredPresets = activeTag === "all"
    ? PRESET_SCENES
    : PRESET_SCENES.filter((p) => p.tags.includes(activeTag))

  function togglePreset(id: string) {
    setSelectedPresetIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id])
  }

  function handleUsePresets() {
    const ordered = selectedPresetIds
      .map((id) => PRESET_SCENES.find((p) => p.id === id))
      .filter(Boolean)
    onApply(ordered.map((p) => {
      // For single-character projects, rewrite shared preset descriptions so the
      // model doesn't try to render two characters and duplicate the LoRA's face.
      const isSingleChar = selectedCharIds.length === 1
      const description = (isSingleChar && p!.focusRole === "shared")
        ? p!.description
            .replace(/\btwo characters\b/gi, "the character")
            .replace(/\bTwo or more characters\b/gi, "The character")
            .replace(/\bcharacters\b/gi, "character")
            .replace(/\btheir\b/gi, "their")
        : p!.description
      return {
        description,
        voiceScript: p!.voiceScript,
        durationSeconds: p!.durationSeconds,
        focusRole: p!.focusRole,
      }
    }))
  }

  const selectedChars = allUserChars.filter((c) => selectedCharIds.includes(c.id))
  const availableChars = allUserChars.filter((c) => !selectedCharIds.includes(c.id))
  const primaryStyle = selectedChars[0]?.selected_style ?? undefined

  function addChar(id: string) {
    if (selectedCharIds.length < MAX_CHARACTERS && !selectedCharIds.includes(id)) {
      onSelectedCharIdsChange([...selectedCharIds, id])
    }
  }

  function removeChar(id: string) {
    if (selectedCharIds.length > 1) {
      onSelectedCharIdsChange(selectedCharIds.filter((x) => x !== id))
    }
  }

  async function handleGenerate() {
    if (!brief.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          style: primaryStyle,
          num_scenes: numScenes,
          character_names: selectedChars.map((c) => c.name),
        }),
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
          <p className="text-sm text-zinc-400 mt-1">Name it, pick your characters, describe your idea</p>
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

          {/* Characters */}
          {allUserChars.length > 0 && (
            <div>
              <Label className="text-sm font-medium text-zinc-700 mb-2 block">
                Characters in this video
                <span className="text-xs font-normal text-zinc-400 ml-1.5">up to {MAX_CHARACTERS}</span>
              </Label>
              <div className="flex flex-wrap gap-2 mb-2">
                {selectedChars.map((char) => (
                  <CharacterPill
                    key={char.id}
                    char={char}
                    onRemove={selectedCharIds.length > 1 ? () => removeChar(char.id) : undefined}
                  />
                ))}
              </div>
              {availableChars.length > 0 && selectedCharIds.length < MAX_CHARACTERS && (
                <select
                  className="mt-1 text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5 cursor-pointer hover:bg-violet-100 transition-colors"
                  value=""
                  onChange={(e) => { if (e.target.value) addChar(e.target.value) }}
                >
                  <option value="">+ Add another character</option>
                  {availableChars.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          )}

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
              disabled={loading || !brief.trim() || selectedCharIds.length === 0}
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0 gap-2"
              size="lg"
            >
              <SparkleIcon className="w-4 h-4 shrink-0" />
              {loading ? "Writing your script…" : "Generate script with AI"}
            </Button>
          </div>
        </div>

        {/* Preset scenes picker */}
        <div className="px-7 pb-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-zinc-700">No script? Pick preset scenes</p>
              <button
                type="button"
                onClick={() => setShowPresets(!showPresets)}
                className="text-xs font-medium text-violet-600 hover:text-violet-800 transition-colors"
              >
                {showPresets ? "Hide ↑" : "Browse 20 scenes →"}
              </button>
            </div>
            <p className="text-xs text-zinc-400 mb-3">Ready-made scene descriptions you can use as-is or edit.</p>

            {showPresets && (
              <>
                {/* Tag filters */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {PRESET_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setActiveTag(tag)}
                      className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors ${
                        activeTag === tag
                          ? "bg-violet-600 text-white border-violet-600"
                          : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                      }`}
                    >
                      {tag.charAt(0).toUpperCase() + tag.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Preset cards */}
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                  {filteredPresets.map((preset) => {
                    const selected = selectedPresetIds.includes(preset.id)
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => togglePreset(preset.id)}
                        className={`text-left p-2.5 rounded-lg border-2 transition-all ${
                          selected
                            ? "border-violet-500 bg-violet-50"
                            : "border-zinc-200 bg-white hover:border-zinc-300"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-1 mb-1">
                          <p className="text-xs font-semibold text-zinc-800 leading-tight">{preset.title}</p>
                          {selected && <span className="text-violet-500 text-sm leading-none shrink-0">✓</span>}
                        </div>
                        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">{preset.description}</p>
                        <span className="inline-block mt-1.5 text-xs text-zinc-500 bg-zinc-100 rounded px-1.5 py-0.5">
                          {preset.durationSeconds}s
                        </span>
                      </button>
                    )
                  })}
                </div>

                {selectedPresetIds.length > 0 && (
                  <Button
                    onClick={handleUsePresets}
                    className="w-full mt-3 bg-zinc-800 hover:bg-zinc-900 text-white border-0"
                  >
                    Use {selectedPresetIds.length} preset scene{selectedPresetIds.length !== 1 ? "s" : ""}
                  </Button>
                )}
              </>
            )}
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
  const voiceId = searchParams.get("voice")

  const initialCharIds = useMemo(() => {
    const multi = searchParams.get("characters")
    const single = searchParams.get("character")
    if (multi) return multi.split(",").filter(Boolean)
    if (single) return [single]
    return []
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(initialCharIds)
  const [allUserChars, setAllUserChars] = useState<CharSummary[]>([])
  const [charsLoading, setCharsLoading] = useState(true)

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

  const scenesRef = useRef(scenes)
  useEffect(() => { scenesRef.current = scenes }, [scenes])

  const projectIdRef = useRef<string | null>(projectId)
  useEffect(() => { projectIdRef.current = projectId }, [projectId])

  const selectedCharIdsRef = useRef(selectedCharIds)
  useEffect(() => { selectedCharIdsRef.current = selectedCharIds }, [selectedCharIds])

  type UsageLimits = { used: number; limit: number | null; resetsAt: string | null; unlimited: boolean }
  const [sceneUsage, setSceneUsage] = useState<UsageLimits | null>(null)

  useEffect(() => {
    fetch("/api/limits").then((r) => r.json()).then((d) => {
      setSceneUsage({ ...d.scenes, unlimited: d.unlimited ?? false })
    }).catch(() => {})
  }, [])

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((data) => setAllUserChars(Array.isArray(data.characters) ? data.characters : []))
      .catch(() => {})
      .finally(() => setCharsLoading(false))
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

  const selectedChars = allUserChars.filter((c) => selectedCharIds.includes(c.id))
  const primaryChar = selectedChars[0] ?? null

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

  const ensureProject = useCallback(async (): Promise<string> => {
    if (projectIdRef.current) return projectIdRef.current
    const charIds = selectedCharIdsRef.current

    // Auto-voice EVERY character — each one needs its own voice so per-scene
    // dialogue plays in the right voice (Kumar speaks as Kumar, Kirti as Kirti).
    // The first character's voice becomes the project default (fallback for
    // shared scenes). Errors are non-fatal; we surface them as a banner.
    let resolvedVoiceId = voiceId
    if (charIds.length > 0) {
      const results = await Promise.allSettled(
        charIds.map((id) => fetch(`/api/characters/${id}/auto-voice`, { method: "POST" }).then((r) => r.json()))
      )
      const firstSuccess = results.find((r) => r.status === "fulfilled" && r.value?.voiceId)
      if (!resolvedVoiceId && firstSuccess?.status === "fulfilled") {
        resolvedVoiceId = firstSuccess.value.voiceId
      }
      if (!resolvedVoiceId) {
        setError("Couldn't set up a voice automatically — your video will have no audio. You can add a voice later from the character page.")
      }
    }

    const res = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ character_ids: charIds, voice_id: resolvedVoiceId, title }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error ?? "Failed to create project")
    }
    const { project } = await res.json()
    projectIdRef.current = project.id
    setProjectId(project.id)
    return project.id
  }, [voiceId, title])

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

  const runScene = useCallback(async (index: number): Promise<"done" | "failed" | "limit"> => {
    const scene = scenesRef.current[index]
    if (!scene) return "failed"

    updateScene(index, { status: "processing", videoClipUrl: null, audioUrl: null, imageUrl: null })

    try {
      const pid = await ensureProject()
      let sceneId = scene.id

      if (!sceneId) {
        const charIds = selectedCharIdsRef.current
        const totalScenes = scenesRef.current.length
        const focusAssignments = assignSceneFocus(charIds, totalScenes)
        // Force shared (focus=null) when either:
        //  - the scene came from a "shared" preset, OR
        //  - the description mentions 2+ project character names by name.
        // Both route through Multi-Kontext, which composes distinct characters
        // from their references instead of duplicating a single LoRA.
        const projectChars = allUserChars.filter((c) => charIds.includes(c.id))
        const charNames = projectChars.map((c) => c.name)
        // Force shared (focus=null) on: preset marked shared, description names
        // 2+ characters, OR description has relational cues implying a second
        // subject ("they", "approaching figure", "embrace", etc). Only meaningful
        // when 2+ project characters exist; otherwise stays on single-char path.
        const isMultiCharScene = charIds.length > 1 && (
          detectMultiCharScene(scene.description, charNames) ||
          hasRelationalCues(scene.description)
        )
        const forceShared = scene.focusRole === "shared" || isMultiCharScene
        const focusCharId = forceShared
          ? null
          : focusAssignments[index]?.focusCharacterId ?? null
        // Resolve speaker name (from AI brief) to a character ID. Audio for this
        // scene plays in this character's voice regardless of who's on screen.
        const speakerCharId = scene.speakerName
          ? projectChars.find((c) => c.name === scene.speakerName)?.id ?? null
          : null

        const res = await fetch(`/api/projects/${pid}/scenes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scenes: [{
              description: scene.description,
              voice_script: scene.voiceScript || undefined,
              order_index: index,
              duration_seconds: scene.durationSeconds,
              focus_character_id: charIds.length > 1 ? focusCharId : null,
              speaker_character_id: speakerCharId,
            }],
          }),
        })
        if (!res.ok) { updateScene(index, { status: "failed" }); return "failed" }
        const { scenes: [created] } = await res.json()
        sceneId = created.id
        updateScene(index, { id: sceneId })
      } else {
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

    const snapshot = scenesRef.current
    const toProcess = snapshot
      .map((s, i) => ({ ...s, _index: i }))
      .filter((s) => !s.videoClipUrl && s.description.trim())

    if (toProcess.length === 0) { setGenerating(false); return }

    toProcess.forEach(({ _index }) => updateScene(_index, { status: "processing" }))

    try {
      const pid = await ensureProject()
      const charIds = selectedCharIdsRef.current
      const focusAssignments = assignSceneFocus(charIds, snapshot.length)

      const projectChars = allUserChars.filter((c) => charIds.includes(c.id))
      const charNames = projectChars.map((c) => c.name)
      const withIds = await Promise.all(
        toProcess.map(async (item) => {
          const { _index, id, description, voiceScript, durationSeconds, focusRole, speakerName } = item
          if (id) {
            await fetch(`/api/scenes/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ description, voiceScript: voiceScript || null, durationSeconds }),
            }).catch(() => {})
            return { ...item, resolvedId: id }
          }
          // Force shared (focus=null) when: preset marked shared, description
          // names 2+ characters, OR description has relational cues implying a
          // second person. Multi-Kontext composes distinct references; LoRA
          // alone would duplicate one trained character into both subject slots.
          const isMultiCharScene = charIds.length > 1 && (
            detectMultiCharScene(description, charNames) ||
            hasRelationalCues(description)
          )
          const forceShared = focusRole === "shared" || isMultiCharScene
          const focusCharId = forceShared
            ? null
            : charIds.length > 1 ? (focusAssignments[_index]?.focusCharacterId ?? null) : null
          const speakerCharId = speakerName
            ? projectChars.find((c) => c.name === speakerName)?.id ?? null
            : null
          const res = await fetch(`/api/projects/${pid}/scenes`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              scenes: [{
                description,
                voice_script: voiceScript || undefined,
                order_index: _index,
                duration_seconds: durationSeconds,
                focus_character_id: focusCharId,
                speaker_character_id: speakerCharId,
              }],
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
      // Individual errors handled inside callbacks
    } finally {
      setGenerating(false)
      setCurrentSceneIndex(null)
    }
  }, [ensureProject, updateScene, pollScene, pollUntilImageReady, formatReset])

  const generateFinalVideo = useCallback(async () => {
    if (!projectId) return
    // Warn if any clip-ready scene is missing audio — stitching now will produce silent gaps
    const clipsWithoutAudio = scenesRef.current.filter((s) => s.videoClipUrl && !s.audioUrl).length
    if (clipsWithoutAudio > 0) {
      const total = scenesRef.current.filter((s) => s.videoClipUrl).length
      const ok = window.confirm(
        `${clipsWithoutAudio} of ${total} scene${total !== 1 ? "s" : ""} have no audio — those parts will be silent.\n\nContinue with silent gaps, or click Cancel to wait/regenerate?`
      )
      if (!ok) return
    }
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
  const atLimit = sceneUsage !== null && !sceneUsage.unlimited && sceneUsage.limit !== null && sceneUsage.used >= sceneUsage.limit
  const hasCharacter = selectedCharIds.length > 0

  const progressPercent =
    currentSceneIndex !== null ? Math.round(((currentSceneIndex + 1) / scenes.length) * 100) : 0

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-zinc-50">
      <Nav breadcrumbs={[{ label: "New Video" }]} />
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <aside className="hidden md:flex md:w-72 shrink-0 border-r border-zinc-200 bg-white flex-col overflow-y-auto">
          <div className="p-6 border-b border-zinc-100">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wide mb-4">
              {selectedChars.length > 1 ? "Characters" : "Character"}
            </h2>
            {charsLoading && <div className="h-40 rounded-xl bg-zinc-100 animate-pulse" />}
            {!charsLoading && selectedChars.length === 0 && (
              <p className="text-sm text-zinc-400">No character selected.</p>
            )}
            {selectedChars.length > 0 && (
              <div className="space-y-3">
                {selectedChars.map((char) => {
                  const imgUrl = char.selected_style_url ?? char.source_photo_url ?? null
                  return (
                    <Card key={char.id} className="overflow-hidden">
                      {imgUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={imgUrl} alt={char.name} className="w-full h-28 object-cover" />
                      )}
                      <CardContent className="p-3">
                        <p className="font-semibold text-zinc-900 text-sm">{char.name}</p>
                      </CardContent>
                    </Card>
                  )
                })}
                {/* Add character button */}
                {allUserChars.filter((c) => !selectedCharIds.includes(c.id)).length > 0 && selectedCharIds.length < MAX_CHARACTERS && (
                  <select
                    className="w-full text-sm text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-violet-100 transition-colors"
                    value=""
                    onChange={(e) => {
                      if (e.target.value) setSelectedCharIds((prev) => [...prev, e.target.value])
                    }}
                  >
                    <option value="">+ Add character</option>
                    {allUserChars.filter((c) => !selectedCharIds.includes(c.id)).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
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
              {sceneUsage.unlimited ? (
                <p className="text-xs font-medium text-violet-600">Unlimited scenes — Super User</p>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-zinc-600">Scenes generated</span>
                    <span className={`font-semibold tabular-nums ${atLimit ? "text-red-600" : sceneUsage.used >= (sceneUsage.limit ?? 0) * 0.8 ? "text-amber-600" : "text-zinc-700"}`}>
                      {sceneUsage.used} / {sceneUsage.limit}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${atLimit ? "bg-red-500" : sceneUsage.used >= (sceneUsage.limit ?? 0) * 0.8 ? "bg-amber-400" : "bg-violet-500"}`}
                      style={{ width: `${Math.min(100, (sceneUsage.used / (sceneUsage.limit ?? 1)) * 100)}%` }}
                    />
                  </div>
                  {sceneUsage.resetsAt && <p className="text-xs text-zinc-400">{formatReset(sceneUsage.resetsAt)}</p>}
                  {atLimit && <p className="text-xs text-red-600 font-medium pt-0.5">Limit reached</p>}
                </div>
              )}
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
                    <Button onClick={generateAllRemaining} disabled={generating || stitching || !hasCharacter || atLimit}
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
                  {scenes.some((s) => s.videoClipUrl && !s.audioUrl) && (
                    <p className="text-xs text-amber-700 mt-1">
                      ⚠️ {scenes.filter((s) => s.videoClipUrl && !s.audioUrl).length} scene{scenes.filter((s) => s.videoClipUrl && !s.audioUrl).length !== 1 ? "s have" : " has"} no audio — those parts will be silent in the final video.
                    </p>
                  )}
                </div>
              </div>
              <Button onClick={generateFinalVideo} disabled={stitching} className="bg-green-600 hover:bg-green-700 text-white shrink-0 gap-2">
                <PlayIcon className="w-4 h-4 shrink-0" />
                {stitching ? "Stitching..." : "Generate Final Video"}
              </Button>
            </div>
          )}

          {/* Final video — preview + share */}
          {finalVideoUrl && (
            <div className="bg-green-50 border-b border-green-200 px-4 md:px-8 py-5 shrink-0">
              <div className="flex items-start gap-4 max-w-4xl mx-auto">
                <video src={finalVideoUrl} controls className="rounded-lg shadow-sm w-56 md:w-72 shrink-0 bg-black" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-green-800 mb-1">Your video is ready 🎉</p>
                  <p className="text-xs text-zinc-600 mb-3">Share it with friends and family — anyone with the link can watch.</p>
                  <ShareButtons url={finalVideoUrl} />
                </div>
              </div>
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
                hasCharacter={hasCharacter}
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
                <Button onClick={generateAllRemaining} disabled={generating || stitching || !hasCharacter || atLimit} className="flex-1">
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
        selectedCharIds={selectedCharIds}
        onSelectedCharIdsChange={setSelectedCharIds}
        allUserChars={allUserChars}
        onApply={handleStartApply}
        onSkip={() => setStartModalOpen(false)}
      />

      <BriefModal
        open={briefModalOpen}
        onClose={() => setBriefModalOpen(false)}
        onApply={applyBriefScenes}
        characterStyle={primaryChar?.selected_style ?? undefined}
        characterNames={selectedChars.map((c) => c.name)}
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
  hasCharacter: boolean
  onUpdate: (patch: Partial<LocalScene>) => void
  onDelete: () => void
  onGenerate: () => void
  showDelete: boolean
}

function SceneCard({ index, scene, disabled, atLimit, hasCharacter, onUpdate, onDelete, onGenerate, showDelete }: SceneCardProps) {
  const isProcessing = scene.status === "processing"
  const isDone = !!scene.videoClipUrl
  const isFailed = scene.status === "failed"
  const canGenerate = !disabled && !atLimit && hasCharacter && scene.description.trim() !== ""

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
            <Button
              variant="outline"
              size="sm"
              onClick={onGenerate}
              disabled={!canGenerate}
              className="gap-1.5 text-zinc-600 hover:text-violet-700 hover:border-violet-300"
              title={!scene.description.trim() ? "Add a description first" : atLimit ? "Daily limit reached" : !hasCharacter ? "No character selected" : "Regenerate this scene with the current description"}
            >
              <RefreshIcon className="w-3.5 h-3.5" />
              Regenerate
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onGenerate}
              disabled={!canGenerate}
              title={!scene.description.trim() ? "Add a description first" : atLimit ? "Daily limit reached" : !hasCharacter ? "No character selected" : "Generate this scene"}
            >
              Generate Scene
            </Button>
          )}
        </div>

        {!isDone && !isProcessing && scene.description.trim() === "" && (
          <p className="text-xs text-zinc-400 mt-2 text-right">Write a description to enable generation</p>
        )}
        {!hasCharacter && !isDone && (
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
