"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  TEMPLATE_FAMILIES,
  ASPECT_RATIOS,
  VOICES,
  type TemplateFamily,
  type AspectRatio,
  type Voice,
} from "@/lib/business/adscript-schema"

const TEMPLATE_LABELS: Record<TemplateFamily, string> = {
  clean_modern: "Understated",
  bold_promo: "Attention-grabber",
  scrapbook: "Warm and hand-crafted",
}

const TEMPLATE_HINTS: Record<TemplateFamily, string> = {
  clean_modern: "Clean type, calm voice. Good for services, real estate, dentists.",
  bold_promo: "Big text, upbeat voice. Good for launches, sales, and new products.",
  scrapbook: "Feels like a memory. Good for family-run businesses and community stories.",
}

const ASPECT_HINTS: Record<AspectRatio, string> = {
  "9:16": "Reels, TikTok, Stories",
  "1:1": "Instagram feed",
  "16:9": "YouTube, your website",
}

const VOICE_LABELS: Record<Voice, { name: string; vibe: string }> = {
  warm_f:      { name: "Warm and friendly",     vibe: "Bakery, cafe, salon" },
  confident_m: { name: "Deep and calm",         vibe: "Real estate, legal, dentist" },
  energetic_f: { name: "Upbeat and expressive", vibe: "Fitness, retail launch, kids' events" },
  calm_m:      { name: "Formal and refined",    vibe: "Consultancy, financial, luxury" },
}

// Default voice per template family — matches the archetype most business
// owners in that category would expect. User can override.
const DEFAULT_VOICE_FOR_TEMPLATE: Record<TemplateFamily, Voice> = {
  clean_modern: "confident_m",
  bold_promo: "energetic_f",
  scrapbook: "warm_f",
}

const MAX_PHOTOS_PER_AD = 8

// Staged messages for the writing-ad overlay. There's no real progress signal
// from the generation call, so we advance through honest descriptions of what
// the backend is doing rather than a fake percentage.
const WRITING_STEPS = [
  "Looking at your photos…",
  "Writing your script…",
  "Matching music and voice…",
  "Double-checking the details…",
]

export type PickerPhoto = { id: string; url: string; uses: number }

// CSS mock of the renderer's composition so users see what an overlay does to
// THEIR photo before spending a render — mirrors lib/business/render/scene.ts:
// blur-fill background + contained photo, bold_promo's palette band (28% of
// frame height, 5% bottom margin, 85% opacity), clean_modern's lower-third
// caption, scrapbook's parchment frame.
function TemplatePreview({ photo, templateFamily, aspectRatio }: {
  photo: PickerPhoto | undefined
  templateFamily: TemplateFamily
  aspectRatio: AspectRatio
}) {
  if (!photo) return null
  const aspectClass =
    aspectRatio === "9:16" ? "aspect-[9/16] w-[200px]"
    : aspectRatio === "1:1" ? "aspect-square w-[260px]"
    : "aspect-video w-full max-w-[420px]"
  const sampleText = "Fresh pastries every morning"

  if (templateFamily === "scrapbook") {
    return (
      <div className={`relative overflow-hidden rounded-xl border border-zinc-200 ${aspectClass}`} style={{ background: "#F5EBDC" }}>
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3">
          <div className="w-[70%] rotate-1 border-8 border-white bg-white shadow-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt="" className="w-full object-cover" />
          </div>
          <span className="text-xs italic" style={{ color: "#4a3b2a" }}>{sampleText}</span>
        </div>
        <PreviewBadge />
      </div>
    )
  }

  return (
    <div className={`relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-900 ${aspectClass}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-70 blur-lg" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photo.url} alt="" className="relative h-full w-full object-contain" />
      {templateFamily === "bold_promo" ? (
        <div
          className="absolute inset-x-0 flex items-center justify-center px-3 text-center"
          style={{ bottom: "5%", height: "28%", background: "rgba(194,65,12,0.85)" }}
        >
          <span className="text-sm font-bold text-white">{sampleText}</span>
        </div>
      ) : (
        <div className="absolute inset-x-0 flex justify-center px-3" style={{ bottom: "10%" }}>
          <span className="rounded bg-black/50 px-2 py-1 text-xs text-white">{sampleText}</span>
        </div>
      )}
      <PreviewBadge />
    </div>
  )
}

function PreviewBadge() {
  return (
    <span className="absolute top-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
      Preview
    </span>
  )
}

export default function BusinessAdGenerator({ businessId, photos: initialPhotos }: { businessId: string; photos: PickerPhoto[] }) {
  const router = useRouter()
  const [photos, setPhotos] = useState<PickerPhoto[]>(initialPhotos)
  // Selection order = the order photos appear in the ad. Default: the user's
  // arranged library order.
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initialPhotos.slice(0, MAX_PHOTOS_PER_AD).map((p) => p.id),
  )
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [templateFamily, setTemplateFamily] = useState<TemplateFamily>("bold_promo")
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16")
  const [voice, setVoice] = useState<Voice>(DEFAULT_VOICE_FOR_TEMPLATE.bold_promo)
  const [voiceEdited, setVoiceEdited] = useState(false)
  const [playingVoice, setPlayingVoice] = useState<Voice | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [writingStep, setWritingStep] = useState(0)

  // Advance the overlay's staged message every 20s while writing. The step
  // is reset to 0 in generate() when the wait starts, so the effect only
  // manages the timer.
  useEffect(() => {
    if (!busy) return
    const t = setInterval(
      () => setWritingStep((i) => Math.min(i + 1, WRITING_STEPS.length - 1)),
      20000,
    )
    return () => clearInterval(t)
  }, [busy])

  function togglePhoto(id: string) {
    setSelectedIds((s) =>
      s.includes(id) ? s.filter((x) => x !== id) : s.length >= MAX_PHOTOS_PER_AD ? s : [...s, id],
    )
  }

  function movePhoto(id: string, dir: -1 | 1) {
    setSelectedIds((s) => {
      const i = s.indexOf(id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= s.length) return s
      const next = [...s]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      for (const f of Array.from(files)) form.append("photos", f)
      const res = await fetch(`/api/business/${businessId}/photos`, { method: "POST", body: form })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? "Couldn't upload those photos. Try again.")
      const added: PickerPhoto[] = (body.photos ?? []).map((p: { id: string; url: string }) => ({
        id: p.id, url: p.url, uses: 0,
      }))
      setPhotos((ps) => [...ps, ...added])
      // Auto-select what was just uploaded — that's why they added it.
      setSelectedIds((s) => [...s, ...added.map((a) => a.id)].slice(0, MAX_PHOTOS_PER_AD))
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't upload those photos. Try again.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  function pickTemplate(tf: TemplateFamily) {
    setTemplateFamily(tf)
    if (!voiceEdited) setVoice(DEFAULT_VOICE_FOR_TEMPLATE[tf])
  }

  function pickVoice(v: Voice) {
    setVoice(v)
    setVoiceEdited(true)
  }

  function playSample(v: Voice) {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
    const url = `/voice-samples/business/${v}.mp3`
    const audio = new Audio(url)
    audioRef.current = audio
    setPlayingVoice(v)
    audio.onended = () => setPlayingVoice(null)
    audio.onerror = () => setPlayingVoice(null)
    audio.play().catch(() => setPlayingVoice(null))
  }

  async function generate() {
    setWritingStep(0)
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/business/${businessId}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateFamily, aspectRatio, voice, assetIds: selectedIds }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "" }))
        // User-friendly copy with next step per Phase 1 error table.
        const msg = body?.error
          ? "We couldn't write your ad this time. Try again in a moment. If it keeps happening, add a bit more detail to your one-liner and try again."
          : "Something went wrong on our end. Try again, or reload the page and pick a different look."
        throw new Error(msg)
      }
      const { ad } = await res.json()
      router.push(`/business/ads/${ad.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong on our end. Try again.")
      setBusy(false)
    }
  }

  return (
    <Card>
      {busy && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-2xl">
            <svg className="mx-auto h-10 w-10 animate-spin text-amber-500" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            <p className="mt-4 font-semibold text-zinc-900">Writing your ad</p>
            <p className="mt-1 text-sm text-zinc-500 animate-pulse">{WRITING_STEPS[writingStep]}</p>
            <p className="mt-3 text-xs text-zinc-400">Usually 1–2 minutes. Keep this tab open.</p>
          </div>
        </div>
      )}
      <CardContent className="p-6 space-y-6">
        <div>
          <Label className="text-sm font-medium text-zinc-700 mb-1 block">Pick photos for this ad</Label>
          <p className="text-xs text-zinc-500 mb-2">
            Tap to pick — the numbers are the order they&apos;ll appear. Up to {MAX_PHOTOS_PER_AD}.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {photos.map((p) => {
              const idx = selectedIds.indexOf(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => togglePhoto(p.id)}
                  className={`relative aspect-square overflow-hidden rounded-xl border-2 transition-colors ${
                    idx >= 0 ? "border-amber-500" : "border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="h-full w-full object-cover" />
                  {idx >= 0 && (
                    <span className="absolute top-1.5 left-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-xs font-bold text-white shadow">
                      {idx + 1}
                    </span>
                  )}
                  {p.uses > 0 && (
                    <span className="absolute bottom-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
                      Used {p.uses}×
                    </span>
                  )}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-zinc-300 text-xs text-zinc-400 transition-colors hover:border-amber-400 hover:text-amber-600"
            >
              <span className="text-2xl leading-none">+</span>
              {uploading ? "Uploading…" : "Add photos"}
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => uploadPhotos(e.target.files)}
          />

          {selectedIds.length > 1 && (
            <div className="mt-3">
              <p className="text-xs text-zinc-500 mb-1.5">Your ad will show them in this order — use the arrows to rearrange.</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {selectedIds.map((id, i) => {
                  const p = photos.find((ph) => ph.id === id)
                  if (!p) return null
                  return (
                    <div key={id} className="relative shrink-0 w-20">
                      <div className="relative h-20 w-20 overflow-hidden rounded-lg border border-zinc-200">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.url} alt="" className="h-full w-full object-cover" />
                        <span className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-[10px] font-bold text-white">
                          {i + 1}
                        </span>
                      </div>
                      <div className="mt-1 flex justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => movePhoto(id, -1)}
                          disabled={i === 0}
                          aria-label={`Move photo ${i + 1} earlier`}
                          className="rounded border border-zinc-200 px-1.5 text-xs text-zinc-500 hover:border-amber-400 hover:text-amber-600 disabled:opacity-30"
                        >
                          ←
                        </button>
                        <button
                          type="button"
                          onClick={() => movePhoto(id, 1)}
                          disabled={i === selectedIds.length - 1}
                          aria-label={`Move photo ${i + 1} later`}
                          className="rounded border border-zinc-200 px-1.5 text-xs text-zinc-500 hover:border-amber-400 hover:text-amber-600 disabled:opacity-30"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        <div>
          <Label className="text-sm font-medium text-zinc-700 mb-2 block">Pick a look</Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {TEMPLATE_FAMILIES.map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => pickTemplate(tf)}
                className={`text-left rounded-xl border-2 px-4 py-3 transition-colors ${
                  templateFamily === tf ? "border-amber-500 bg-amber-50" : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="font-medium text-zinc-900">{TEMPLATE_LABELS[tf]}</div>
                <div className="text-xs text-zinc-500 mt-1">{TEMPLATE_HINTS[tf]}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-zinc-700 mb-2 block">Where will you post it?</Label>
          <div className="grid grid-cols-3 gap-2">
            {ASPECT_RATIOS.map((ar) => (
              <button
                key={ar}
                type="button"
                onClick={() => setAspectRatio(ar)}
                className={`rounded-xl border-2 px-4 py-3 text-center transition-colors ${
                  aspectRatio === ar ? "border-amber-500 bg-amber-50" : "border-zinc-200 hover:border-zinc-300"
                }`}
              >
                <div className="font-medium text-zinc-900">{ar}</div>
                <div className="text-xs text-zinc-500 mt-1">{ASPECT_HINTS[ar]}</div>
              </button>
            ))}
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div>
            <Label className="text-sm font-medium text-zinc-700 mb-1 block">How your photos will look</Label>
            <p className="text-xs text-zinc-500 mb-2">
              Live preview of your first photo in the &ldquo;{TEMPLATE_LABELS[templateFamily]}&rdquo; look. Example text shown — we write the real words for you.
            </p>
            <TemplatePreview
              photo={photos.find((p) => p.id === selectedIds[0])}
              templateFamily={templateFamily}
              aspectRatio={aspectRatio}
            />
          </div>
        )}

        <div>
          <Label className="text-sm font-medium text-zinc-700 mb-2 block">Pick a voice</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {VOICES.map((v) => {
              const selected = voice === v
              const isDefault = DEFAULT_VOICE_FOR_TEMPLATE[templateFamily] === v && !voiceEdited
              return (
                <div
                  key={v}
                  className={`rounded-xl border-2 px-4 py-3 transition-colors ${
                    selected ? "border-amber-500 bg-amber-50" : "border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => pickVoice(v)}
                    className="text-left w-full"
                  >
                    <div className="font-medium text-zinc-900 flex items-center gap-2">
                      {VOICE_LABELS[v].name}
                      {isDefault && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-zinc-500 mt-0.5">{VOICE_LABELS[v].vibe}</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => playSample(v)}
                    className="mt-2 text-xs font-medium text-amber-700 hover:text-amber-800"
                  >
                    {playingVoice === v ? "Playing…" : "Play sample"}
                  </button>
                </div>
              )
            })}
          </div>
        </div>

        {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-100">{error}</p>}

        <Button
          size="lg"
          onClick={generate}
          disabled={busy || selectedIds.length === 0}
          title={selectedIds.length === 0 ? "Pick at least one photo first." : undefined}
          className="w-full bg-gradient-to-r from-orange-600 to-red-700 hover:from-orange-700 hover:to-red-800 text-white border-0"
        >
          {busy
            ? "Writing your ad… (1-2 minutes)"
            : selectedIds.length === 0
              ? "Pick at least one photo"
              : `Bring my ad to life (${selectedIds.length} photo${selectedIds.length === 1 ? "" : "s"})`}
        </Button>
      </CardContent>
    </Card>
  )
}
