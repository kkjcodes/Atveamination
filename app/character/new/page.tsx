"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { useRouter } from "next/navigation"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import type { CharacterOption, JobStatus } from "@/types"
import { PRESET_VOICES } from "@/lib/fal/client"

const STYLES = ["pixar", "anime", "ghibli", "chibi", "comic", "sketch", "watercolor", "claymation"] as const
const STYLE_LABELS: Record<string, string> = {
  pixar:      "Pixar 3D",
  anime:      "Anime",
  ghibli:     "Studio Ghibli",
  chibi:      "Chibi / Kawaii",
  comic:      "Comic Book",
  sketch:     "Pencil Sketch",
  watercolor: "Watercolor",
  claymation: "Claymation",
}

type Step = 1 | 2 | 3 | 4

function StepIndicator({ current }: { current: Step }) {
  const steps = [
    { n: 1, label: "Upload Your Photo" },
    { n: 2, label: "Choose Your Style" },
    { n: 3, label: "Train Character" },
    { n: 4, label: "Pick a Voice" },
  ]
  return (
    <div className="flex items-center gap-0 mb-10">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                current >= s.n
                  ? "bg-violet-600 text-white"
                  : "bg-zinc-100 text-zinc-400"
              }`}
            >
              {s.n}
            </div>
            <span
              className={`text-xs whitespace-nowrap ${
                current >= s.n ? "text-violet-700 font-medium" : "text-zinc-400"
              }`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-px w-10 mx-2 mb-5 transition-colors ${
                current > s.n ? "bg-violet-400" : "bg-zinc-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  )
}

export default function NewCharacterPage() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>(1)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [characterName, setCharacterName] = useState("")
  const [characterDescription, setCharacterDescription] = useState("")
  const [characterId, setCharacterId] = useState<string | null>(null)
  const [styleOptions, setStyleOptions] = useState<CharacterOption[]>([])
  const [loadingStyles, setLoadingStyles] = useState(false)
  const [loadingMoreStyles, setLoadingMoreStyles] = useState(false)
  const [batch2Loaded, setBatch2Loaded] = useState(false)
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null)
  const [trainingJobId, setTrainingJobId] = useState<string | null>(null)
  const [trainingStatus, setTrainingStatus] = useState<JobStatus>("pending")
  const [trainingProgress, setTrainingProgress] = useState(0)
  const [trainingPhase, setTrainingPhase] = useState<"augmenting" | "training">("training")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Step 4: voice selection
  const [selectedVoice, setSelectedVoice] = useState<string | null>(null)
  const [voiceGender, setVoiceGender] = useState<"all" | "male" | "female">("all")
  const [voiceAccent, setVoiceAccent] = useState<"all" | "american" | "british">("all")
  const [savingVoice, setSavingVoice] = useState(false)

  const onFileDrop = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.")
      return
    }
    setError(null)
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file) onFileDrop(file)
    },
    [onFileDrop]
  )

  const onFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileDrop(file)
    },
    [onFileDrop]
  )

  async function handleUploadAndGenerateStyles() {
    if (!photoFile) return
    setSubmitting(true)
    setError(null)

    try {
      const fd = new FormData()
      fd.append("photo", photoFile)
      if (characterName.trim()) fd.append("name", characterName.trim())
      if (characterDescription.trim()) {
        fd.append("character_description", characterDescription.trim())
      }

      const res = await fetch("/api/characters", { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")

      const charId: string = data.character.id
      setCharacterId(charId)
      setStep(2)
      setLoadingStyles(true)

      const stylesRes = await fetch(`/api/characters/${charId}/generate-styles`, {
        method: "POST",
      })
      const stylesData = await stylesRes.json()
      if (!stylesRes.ok) throw new Error(stylesData.error ?? "Style generation failed")

      setStyleOptions(stylesData.options)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
    } finally {
      setSubmitting(false)
      setLoadingStyles(false)
    }
  }

  async function handleSelectAndTrain() {
    if (!characterId || !selectedOptionId) return
    setSubmitting(true)
    setError(null)

    try {
      const selectRes = await fetch(`/api/characters/${characterId}/select-style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ option_id: selectedOptionId }),
      })
      if (!selectRes.ok) {
        const d = await selectRes.json()
        throw new Error(d.error ?? "Failed to select style")
      }

      // Step 3 — augmentation phase first
      setTrainingPhase("augmenting")
      setStep(3)
      setSubmitting(false)

      const augRes = await fetch(`/api/characters/${characterId}/augment`, { method: "POST" })
      if (!augRes.ok) {
        const d = await augRes.json()
        // Non-fatal — fall back to single-image training
        console.warn("[new] augment failed, proceeding with 1 image:", d.error)
      }

      setTrainingPhase("training")
      const trainRes = await fetch(`/api/characters/${characterId}/train`, { method: "POST" })
      const trainData = await trainRes.json()
      if (!trainRes.ok) throw new Error(trainData.error ?? "Failed to start training")

      setTrainingJobId(trainData.job_id)
      setTrainingStatus("processing")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setStep(2)
    }
  }

  // Poll job status in step 3
  useEffect(() => {
    if (step !== 3 || !trainingJobId) return
    if (trainingStatus === "succeeded" || trainingStatus === "failed") return

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${trainingJobId}`)
        const data = await res.json()
        if (!res.ok) return
        const status: JobStatus = data.job.status
        setTrainingStatus(status)
        // Fake progress so the bar animates while waiting
        setTrainingProgress((prev) => Math.min(prev + 4, 90))

        if (status === "succeeded") {
          setTrainingProgress(100)
          setTimeout(() => setStep(4), 1200)
        }
      } catch {
        // network blip — keep polling
      }
    }

    const interval = setInterval(poll, 5000)
    poll()
    return () => clearInterval(interval)
  }, [step, trainingJobId, trainingStatus, characterId, router])

  async function loadMoreStyles() {
    if (!characterId || batch2Loaded || loadingMoreStyles) return
    setLoadingMoreStyles(true)
    try {
      const res = await fetch(`/api/characters/${characterId}/generate-styles?batch=2`, { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setStyleOptions((prev) => [...prev, ...data.options])
        setBatch2Loaded(true)
      }
    } catch {
      // non-fatal — user can still pick from batch 1
    } finally {
      setLoadingMoreStyles(false)
    }
  }

  async function saveVoiceAndContinue() {
    if (!characterId || !selectedVoice) return
    setSavingVoice(true)
    try {
      const form = new FormData()
      form.append("character_id", characterId)
      form.append("tts_params", JSON.stringify({ kokoroVoice: selectedVoice }))
      await fetch("/api/voice", { method: "POST", body: form })
    } catch {
      // non-fatal — user can set voice later
    }
    router.push(`/character/${characterId}`)
  }

  const filteredVoices = PRESET_VOICES.filter((v) => {
    if (voiceGender !== "all" && v.gender !== voiceGender) return false
    if (voiceAccent !== "all" && v.accent !== voiceAccent) return false
    return true
  })

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "New Character" }]} />
      <div className="flex flex-col items-center py-12 px-4">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">Create Your Character</h1>
          <p className="text-zinc-500 mt-1">
            Turn your photo into a custom AI cartoon character
          </p>
        </div>

        <StepIndicator current={step} />

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {step === 1 && (
          <Card>
            <CardContent className="pt-6">
              <div
                className={`relative flex flex-col items-center justify-center rounded-xl border-2 border-dashed transition-colors cursor-pointer min-h-64 ${
                  photoPreview
                    ? "border-violet-300 bg-violet-50"
                    : "border-zinc-300 bg-white hover:border-violet-400 hover:bg-violet-50"
                }`}
                onDragOver={onDragOver}
                onDrop={onDrop}
                onClick={() => !photoPreview && fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={onFileChange}
                />
                {photoPreview ? (
                  <div className="relative w-full h-64">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photoPreview}
                      alt="Your photo"
                      className="w-full h-full object-contain rounded-xl"
                    />
                    <button
                      type="button"
                      className="absolute top-2 right-2 bg-white rounded-full p-1 shadow text-zinc-500 hover:text-zinc-800 text-xs font-medium px-2 py-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        setPhotoFile(null)
                        setPhotoPreview(null)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 p-10 text-center">
                    <div className="w-14 h-14 rounded-full bg-violet-100 flex items-center justify-center">
                      <svg
                        className="w-7 h-7 text-violet-500"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="font-medium text-zinc-700">
                        Drag & drop your photo here
                      </p>
                      <p className="text-sm text-zinc-400 mt-1">
                        or click to browse — JPG, PNG, WEBP
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-5 space-y-1.5">
                <Label htmlFor="char-name" className="text-sm font-medium text-zinc-700">
                  Character name
                </Label>
                <input
                  id="char-name"
                  type="text"
                  value={characterName}
                  onChange={(e) => setCharacterName(e.target.value)}
                  placeholder="e.g. Captain Sparks"
                  disabled={submitting}
                  className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50"
                />
              </div>

              <div className="mt-4 space-y-1.5">
                <Label htmlFor="char-desc" className="text-sm font-medium text-zinc-700">
                  Describe your character
                  <span className="text-zinc-400 font-normal ml-1">(optional but recommended)</span>
                </Label>
                <Textarea
                  id="char-desc"
                  value={characterDescription}
                  onChange={(e) => setCharacterDescription(e.target.value)}
                  placeholder="e.g. 35-year-old man with curly brown hair, athletic build, friendly smile"
                  rows={2}
                  disabled={submitting}
                />
                <p className="text-xs text-zinc-400">
                  Age, gender, physical traits — prepended to every scene prompt for consistency across all videos.
                </p>
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  disabled={!photoFile || submitting}
                  onClick={handleUploadAndGenerateStyles}
                  size="lg"
                >
                  {submitting ? "Uploading…" : "Generate Cartoon Styles"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <div>
            <p className="text-sm text-zinc-500 mb-4">
              {loadingStyles
                ? "Generating your cartoon styles — this takes about a minute…"
                : "Pick the style you like best, then we'll train your character."}
            </p>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {(["pixar", "anime", "ghibli", "chibi",
                 ...(loadingMoreStyles || batch2Loaded ? ["comic", "sketch", "watercolor", "claymation"] : [])] as const
              ).map((styleName) => {
                const option = styleOptions.find((o) => o.style_name === styleName)
                const isSelected = option && selectedOptionId === option.id
                return (
                  <button
                    key={styleName}
                    type="button"
                    disabled={!option || submitting}
                    onClick={() => option && setSelectedOptionId(option.id)}
                    className={`relative rounded-xl border-2 overflow-hidden transition-all focus:outline-none ${
                      isSelected
                        ? "border-violet-500 ring-2 ring-violet-300"
                        : "border-zinc-200 hover:border-violet-300"
                    } ${!option ? "opacity-60 cursor-wait" : "cursor-pointer"}`}
                  >
                    {option ? (
                      <div className="relative aspect-square">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={option.style_url}
                          alt={STYLE_LABELS[styleName]}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                        {isSelected && (
                          <div className="absolute inset-0 bg-violet-600/10 flex items-end p-2">
                            <span className="bg-violet-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                              Selected
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="aspect-square bg-zinc-100 animate-pulse" />
                    )}
                    <div className="py-2 px-3 text-left">
                      <p className="text-sm font-medium text-zinc-800">{STYLE_LABELS[styleName]}</p>
                    </div>
                  </button>
                )
              })}
            </div>

            {!loadingStyles && !batch2Loaded && (
              <div className="flex justify-center">
                <button
                  type="button"
                  disabled={loadingMoreStyles}
                  onClick={loadMoreStyles}
                  className="text-sm text-violet-600 hover:text-violet-800 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loadingMoreStyles ? "Generating 4 more styles…" : "Try 4 more styles →"}
                </button>
              </div>
            )}

            <div className="flex justify-end">
              <Button
                disabled={!selectedOptionId || submitting || loadingStyles}
                size="lg"
                onClick={handleSelectAndTrain}
              >
                {submitting ? "Starting training…" : "Train My Character"}
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <Card>
            <CardContent className="pt-8 pb-10 flex flex-col items-center gap-6 text-center">
              <div className="w-20 h-20 rounded-full bg-violet-100 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-violet-500 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                  />
                </svg>
              </div>

              <div>
                <h2 className="text-xl font-semibold text-zinc-900">
                  {trainingPhase === "augmenting"
                    ? "Generating Training Images"
                    : "Training Your Character"}
                </h2>
                <p className="text-zinc-500 mt-1 text-sm">
                  {trainingPhase === "augmenting"
                    ? "Creating 20 pose & expression variations for high-accuracy training — takes 3–5 min"
                    : "This is a one-time setup. Once done, your character is ready to use in unlimited videos."}
                </p>
              </div>

              <div className="w-full max-w-sm">
                {trainingPhase === "augmenting" ? (
                  <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
                    <div className="h-full bg-violet-500 animate-pulse w-1/2 rounded-full" />
                  </div>
                ) : (
                  <Progress value={trainingProgress} className="h-2.5" />
                )}
                <p className="text-xs text-zinc-400 mt-2 text-right capitalize">
                  {trainingPhase === "augmenting" ? "Generating images…" : trainingStatus}
                </p>
              </div>

              {trainingPhase === "training" && (
                <div className="w-full max-w-sm rounded-lg bg-violet-50 border border-violet-100 px-4 py-3 text-left space-y-1.5">
                  <p className="text-xs font-semibold text-violet-700 uppercase tracking-wide">While you wait</p>
                  <ul className="text-xs text-zinc-600 space-y-1">
                    <li>Safe to close this tab — we save your progress automatically</li>
                    <li>Takes 10–15 min but produces a much more accurate likeness</li>
                    <li>You only train once — all future videos use the same character</li>
                  </ul>
                </div>
              )}

              {trainingStatus === "failed" && (
                <div className="text-sm text-red-600">
                  Training failed.{" "}
                  <button
                    className="underline font-medium"
                    onClick={() => router.push(`/character/${characterId}`)}
                  >
                    Go to character page to retry.
                  </button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold text-zinc-900">Pick a Voice</h2>
              <p className="text-sm text-zinc-500 mt-1">
                This voice will narrate every scene. You can record your own voice later from the character page.
              </p>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-sm">
                {(["all", "female", "male"] as const).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setVoiceGender(g)}
                    className={`px-3 py-1.5 transition-colors ${voiceGender === g ? "bg-violet-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
                  >
                    {g === "all" ? "Any gender" : g === "female" ? "Female" : "Male"}
                  </button>
                ))}
              </div>
              <div className="flex rounded-lg border border-zinc-200 overflow-hidden text-sm">
                {(["all", "american", "british"] as const).map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setVoiceAccent(a)}
                    className={`px-3 py-1.5 transition-colors ${voiceAccent === a ? "bg-violet-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"}`}
                  >
                    {a === "all" ? "Any accent" : a === "american" ? "American" : "British"}
                  </button>
                ))}
              </div>
            </div>

            {/* Voice grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredVoices.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => setSelectedVoice(v.id)}
                  className={`text-left rounded-xl border-2 px-4 py-3 transition-colors ${
                    selectedVoice === v.id
                      ? "border-violet-500 bg-violet-50"
                      : "border-zinc-200 hover:border-zinc-300 bg-white"
                  }`}
                >
                  <p className="font-semibold text-zinc-900 text-sm">{v.label}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {v.description} · {v.gender === "female" ? "Female" : "Male"} · {v.accent === "american" ? "American" : "British"}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => router.push(`/character/${characterId}`)}
                className="text-sm text-zinc-400 hover:text-zinc-600"
              >
                Skip for now
              </button>
              <Button
                size="lg"
                disabled={!selectedVoice || savingVoice}
                onClick={saveVoiceAndContinue}
              >
                {savingVoice ? "Saving…" : selectedVoice ? `Use ${PRESET_VOICES.find((v) => v.id === selectedVoice)?.label}` : "Select a voice"}
              </Button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}
