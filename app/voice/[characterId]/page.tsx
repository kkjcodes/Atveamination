"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { PRESET_VOICES } from "@/lib/fal/client"

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function VoiceSetupPage() {
  const { characterId } = useParams<{ characterId: string }>()
  const router = useRouter()

  const [mode, setMode] = useState<"choose" | "preset" | "record">("choose")
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [voiceGender, setVoiceGender] = useState<"all" | "male" | "female">("all")
  const [voiceAccent, setVoiceAccent] = useState<"all" | "american" | "british">("all")

  const [isRecording, setIsRecording] = useState(false)
  const [recordingTimer, setRecordingTimer] = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)

  const [testPhrase, setTestPhrase] = useState(
    "Hello! I'm your cartoon character. Let's make a video together!"
  )
  const [previewAudioUrl, setPreviewAudioUrl] = useState<string | null>(null)
  const [generatingPreview, setGeneratingPreview] = useState(false)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (recordedUrl) URL.revokeObjectURL(recordedUrl)
    }
  }, [recordedUrl])

  async function startRecording() {
    setError(null)
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mr = new MediaRecorder(stream, { mimeType: "audio/webm" })
    chunksRef.current = []
    mr.ondataavailable = (e) => chunksRef.current.push(e.data)
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      const blob = new Blob(chunksRef.current, { type: "audio/webm" })
      setAudioBlob(blob)
      setRecordedUrl(URL.createObjectURL(blob))
      setPreviewAudioUrl(null)
    }
    mr.start()
    mediaRecorderRef.current = mr
    setRecordingTimer(0)
    setIsRecording(true)
    timerRef.current = setInterval(() => setRecordingTimer((t) => t + 1), 1000)
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current)
    mediaRecorderRef.current?.stop()
    setIsRecording(false)
  }

  async function generatePreview() {
    if (!audioBlob) return
    setGeneratingPreview(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("audio", audioBlob, "sample.webm")
      form.append("text", testPhrase)
      const res = await fetch("/api/voice/preview", { method: "POST", body: form })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? "Preview failed")
      }
      const { audio_url } = await res.json()
      setPreviewAudioUrl(audio_url)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate preview")
    } finally {
      setGeneratingPreview(false)
    }
  }

  async function savePreset() {
    if (!selectedPreset) return
    setSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("character_id", characterId)
      form.append("tts_params", JSON.stringify({ kokoroVoice: selectedPreset }))
      const res = await fetch("/api/voice", { method: "POST", body: form })
      if (!res.ok) throw new Error(await res.text())
      router.push(`/character/${characterId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save voice")
      setSaving(false)
    }
  }

  async function saveRecording() {
    if (!audioBlob) {
      setError("Please record a voice sample first.")
      return
    }
    setSaving(true)
    setError(null)
    try {
      const form = new FormData()
      form.append("audio", audioBlob, "sample.webm")
      form.append("character_id", characterId)
      form.append("tts_params", JSON.stringify({}))
      const res = await fetch("/api/voice", { method: "POST", body: form })
      if (!res.ok) throw new Error(await res.text())
      router.push(`/character/${characterId}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save voice")
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[
        { label: "Character", href: `/character/${characterId}` },
        { label: "Voice Setup" },
      ]} />
      <div className="max-w-2xl mx-auto py-10 px-4 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-zinc-900">Set Up Your Voice</h1>
          <p className="text-zinc-500 mt-1">
            Choose a preset voice or clone your own — used for narration in every scene.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {mode === "choose" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setMode("preset")}
              className="group text-left rounded-xl border-2 border-zinc-200 hover:border-violet-400 bg-white p-6 transition-colors"
            >
              <div className="text-2xl mb-3">🎙️</div>
              <p className="font-semibold text-zinc-900 group-hover:text-violet-700">Use a Preset Voice</p>
              <p className="text-sm text-zinc-500 mt-1">Pick from 4 high-quality AI voices. No recording needed.</p>
            </button>
            <button
              type="button"
              onClick={() => setMode("record")}
              className="group text-left rounded-xl border-2 border-zinc-200 hover:border-violet-400 bg-white p-6 transition-colors"
            >
              <div className="text-2xl mb-3">🎤</div>
              <p className="font-semibold text-zinc-900 group-hover:text-violet-700">Clone Your Own Voice</p>
              <p className="text-sm text-zinc-500 mt-1">Record 10–30 seconds and we'll clone your voice with AI.</p>
            </button>
          </div>
        )}

        {mode === "preset" && (
          <>
            <button type="button" onClick={() => setMode("choose")} className="text-sm text-zinc-400 hover:text-zinc-600">
              ← Back
            </button>
            <Card>
              <CardHeader>
                <CardTitle>Choose a Preset Voice</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-2">
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
                {/* Voice list */}
                <div className="space-y-2">
                  {PRESET_VOICES.filter((v) => {
                    if (voiceGender !== "all" && v.gender !== voiceGender) return false
                    if (voiceAccent !== "all" && v.accent !== voiceAccent) return false
                    return true
                  }).map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedPreset(v.id)}
                      className={`w-full text-left rounded-lg border-2 px-4 py-3 transition-colors ${
                        selectedPreset === v.id
                          ? "border-violet-500 bg-violet-50"
                          : "border-zinc-200 hover:border-zinc-300 bg-white"
                      }`}
                    >
                      <p className="font-semibold text-zinc-900 text-sm">{v.label}</p>
                      <p className="text-xs text-zinc-500">
                        {v.description} · {v.gender === "female" ? "Female" : "Male"} · {v.accent === "american" ? "American" : "British"}
                      </p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Button
              onClick={savePreset}
              disabled={saving || !selectedPreset}
              size="lg"
              className="w-full"
            >
              {saving ? "Saving…" : selectedPreset ? `Use ${PRESET_VOICES.find(v => v.id === selectedPreset)?.label} Voice` : "Select a Voice"}
            </Button>
          </>
        )}

        {mode === "record" && (
          <>
            <button type="button" onClick={() => setMode("choose")} className="text-sm text-zinc-400 hover:text-zinc-600">
              ← Back
            </button>

            <Card>
              <CardHeader>
                <CardTitle>1. Record a Voice Sample</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-zinc-500">
                  Speak naturally for 10–30 seconds. Read anything — the AI will learn your voice, not the content.
                </p>

                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={isRecording ? stopRecording : startRecording}
                    className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-3xl font-bold shadow-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
                      isRecording
                        ? "bg-red-500 hover:bg-red-600 animate-pulse"
                        : "bg-violet-500 hover:bg-violet-600"
                    }`}
                    aria-label={isRecording ? "Stop recording" : "Start recording"}
                  >
                    {isRecording ? "■" : "●"}
                  </button>
                  {isRecording && (
                    <p className="text-lg font-mono text-zinc-700 tabular-nums">
                      {formatTime(recordingTimer)}
                    </p>
                  )}
                </div>

                {recordedUrl && (
                  <div className="space-y-2">
                    <audio controls src={recordedUrl} className="w-full" />
                    <p className="text-xs text-zinc-400">Recording captured. Re-record any time.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>2. Preview Your Cloned Voice</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-zinc-500">
                  Enter any text and hear it spoken in your cloned voice.
                  {!audioBlob && " Record a sample first to enable preview."}
                </p>

                <div className="space-y-2">
                  <Label htmlFor="test-phrase">Test phrase</Label>
                  <Textarea
                    id="test-phrase"
                    value={testPhrase}
                    onChange={(e) => setTestPhrase(e.target.value)}
                    rows={3}
                    disabled={!audioBlob}
                  />
                </div>

                <Button
                  onClick={generatePreview}
                  disabled={generatingPreview || !audioBlob || !testPhrase.trim()}
                  variant="outline"
                >
                  {generatingPreview ? "Generating (~15s)…" : "Preview My Voice"}
                </Button>

                {previewAudioUrl && (
                  <div className="space-y-1">
                    <p className="text-xs text-zinc-500">Your cloned voice:</p>
                    <audio controls src={previewAudioUrl} className="w-full" />
                  </div>
                )}
              </CardContent>
            </Card>

            <Button
              onClick={saveRecording}
              disabled={saving || !audioBlob}
              size="lg"
              className="w-full"
            >
              {saving ? "Saving…" : "Save Voice & Return to Character"}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
