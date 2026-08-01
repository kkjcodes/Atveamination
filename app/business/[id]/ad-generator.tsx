"use client"

import { useRef, useState } from "react"
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

export default function BusinessAdGenerator({ businessId, photoCount }: { businessId: string; photoCount: number }) {
  const router = useRouter()
  const [templateFamily, setTemplateFamily] = useState<TemplateFamily>("bold_promo")
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("9:16")
  const [voice, setVoice] = useState<Voice>(DEFAULT_VOICE_FOR_TEMPLATE.bold_promo)
  const [voiceEdited, setVoiceEdited] = useState(false)
  const [playingVoice, setPlayingVoice] = useState<Voice | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

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
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/business/${businessId}/ads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateFamily, aspectRatio, voice }),
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
      <CardContent className="p-6 space-y-6">
        <div>
          <p className="text-sm text-zinc-500">{photoCount} photo{photoCount === 1 ? "" : "s"} ready. Let&apos;s make an ad.</p>
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
          disabled={busy}
          className="w-full bg-gradient-to-r from-orange-600 to-red-700 hover:from-orange-700 hover:to-red-800 text-white border-0"
        >
          {busy ? "Writing your ad… (1-2 minutes)" : "Bring my ad to life"}
        </Button>
      </CardContent>
    </Card>
  )
}
