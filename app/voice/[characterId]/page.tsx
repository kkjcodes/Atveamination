"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
}

export default function VoiceSetupPage() {
  const { characterId } = useParams<{ characterId: string }>()
  const router = useRouter()

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

  async function saveAndContinue() {
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
            Record a sample and we'll clone your voice for video narration using AI.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Record */}
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

        {/* Step 2: Preview */}
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
          onClick={saveAndContinue}
          disabled={saving || !audioBlob}
          size="lg"
          className="w-full"
        >
          {saving ? "Saving…" : "Save Voice & Return to Character"}
        </Button>
      </div>
    </div>
  )
}
