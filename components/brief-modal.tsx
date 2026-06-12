"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

type GeneratedScene = {
  description: string
  voiceScript: string
  durationSeconds: 5 | 10 | 15
}

type Props = {
  open: boolean
  onClose: () => void
  onApply: (scenes: GeneratedScene[]) => void
  characterStyle?: string
}

const SCENE_COUNT_OPTIONS = [2, 3, 4, 5, 6, 8]

export default function BriefModal({ open, onClose, onApply, characterStyle }: Props) {
  const [brief, setBrief] = useState("")
  const [numScenes, setNumScenes] = useState(4)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [generated, setGenerated] = useState<GeneratedScene[] | null>(null)

  if (!open) return null

  async function handleGenerate() {
    if (!brief.trim()) return
    setLoading(true)
    setError(null)
    setGenerated(null)

    try {
      const res = await fetch("/api/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief,
          style: characterStyle,
          num_scenes: numScenes,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 429 && data.resetsAt) {
          const diff = new Date(data.resetsAt).getTime() - Date.now()
          const h = Math.ceil(diff / 1000 / 60 / 60)
          const resetStr = h <= 1 ? "less than 1 hour" : `${h} hours`
          throw new Error(`${data.error} (${data.used}/${data.limit} used today · resets in ${resetStr})`)
        }
        throw new Error(data.error ?? "Failed to generate scenes")
      }

      // Normalise field names from API (snake_case) to component (camelCase)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const scenes: GeneratedScene[] = (data.scenes as any[]).map((s) => ({
        description: String(s.description ?? ""),
        voiceScript: String(s.voice_script ?? ""),
        durationSeconds: ([5, 10, 15] as const).includes(s.duration_seconds) ? s.duration_seconds : 5,
      }))
      setGenerated(scenes)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  function handleApply() {
    if (generated) {
      onApply(generated)
      setBrief("")
      setGenerated(null)
      onClose()
    }
  }

  function handleClose() {
    setBrief("")
    setGenerated(null)
    setError(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-100">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Generate scenes with AI</h2>
            <p className="text-sm text-zinc-400 mt-0.5">Describe your video idea and AI will write detailed scene prompts</p>
          </div>
          <button
            onClick={handleClose}
            className="text-zinc-400 hover:text-zinc-600 text-xl leading-none ml-4"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {!generated ? (
            <>
              <div>
                <Label htmlFor="brief" className="text-sm font-medium text-zinc-700 mb-2 block">
                  What&apos;s your video about?
                </Label>
                <Textarea
                  id="brief"
                  value={brief}
                  onChange={(e) => setBrief(e.target.value)}
                  placeholder="e.g. A short video where my character wakes up, makes coffee, and heads out for an adventure in a magical forest. Should feel upbeat and fun, about 30 seconds long."
                  rows={5}
                  className="resize-none"
                  disabled={loading}
                />
                <p className="text-xs text-zinc-400 mt-1.5">
                  Include mood, setting, key actions, and rough length — the more detail, the better the output.
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium text-zinc-700 mb-2 block">Number of scenes</Label>
                <div className="flex gap-2">
                  {SCENE_COUNT_OPTIONS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setNumScenes(n)}
                      disabled={loading}
                      className={`h-9 w-10 text-sm rounded-lg border font-medium transition-colors ${
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

              {error && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              )}
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-zinc-500">
                Review and edit these scenes before adding them to your project.
              </p>
              {generated.map((scene, i) => (
                <div key={i} className="border border-zinc-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded">
                      Scene {i + 1}
                    </span>
                    <div className="flex gap-1">
                      {([5, 10, 15] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() =>
                            setGenerated((prev) =>
                              prev ? prev.map((s, j) => (j === i ? { ...s, durationSeconds: d } : s)) : prev
                            )
                          }
                          className={`h-6 px-2 text-xs rounded border font-medium transition-colors ${
                            scene.durationSeconds === d
                              ? "bg-violet-600 text-white border-violet-600"
                              : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"
                          }`}
                        >
                          {d}s
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Scene description</Label>
                    <Textarea
                      value={scene.description}
                      onChange={(e) =>
                        setGenerated((prev) =>
                          prev ? prev.map((s, j) => (j === i ? { ...s, description: e.target.value } : s)) : prev
                        )
                      }
                      rows={3}
                      className="resize-none text-sm"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-zinc-400 mb-1 block">Voice script</Label>
                    <Textarea
                      value={scene.voiceScript}
                      onChange={(e) =>
                        setGenerated((prev) =>
                          prev ? prev.map((s, j) => (j === i ? { ...s, voiceScript: e.target.value } : s)) : prev
                        )
                      }
                      rows={2}
                      className="resize-none text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex justify-between items-center">
          {generated ? (
            <>
              <button
                type="button"
                onClick={() => setGenerated(null)}
                className="text-sm text-zinc-500 hover:text-zinc-700"
              >
                ← Back
              </button>
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleApply}>
                  Use {generated.length} scene{generated.length !== 1 ? "s" : ""}
                </Button>
              </div>
            </>
          ) : (
            <>
              <span />
              <div className="flex gap-3">
                <Button variant="outline" onClick={handleClose}>Cancel</Button>
                <Button onClick={handleGenerate} disabled={loading || !brief.trim()}>
                  {loading ? "Generating…" : "Generate scenes"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
