"use client"

import { useRef, useState } from "react"
import { readJson } from "@/lib/client/safe-json"
import { trackEvent } from "@/lib/client/track"

const STYLES = [
  { id: "pixar", label: "Pixar 3D" },
  { id: "anime", label: "Anime" },
  { id: "comic", label: "Comic" },
  { id: "watercolor", label: "Watercolor" },
] as const

type Phase = "idle" | "working" | "done"

// The no-signup taste (task B1): drop a photo, see yourself as a cartoon,
// zero form fields. Used in the homepage hero and on /try.
export default function TryWidget({ compact = false }: { compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [style, setStyle] = useState<(typeof STYLES)[number]["id"]>("pixar")
  const [phase, setPhase] = useState<Phase>("idle")
  const [error, setError] = useState<string | null>(null)
  const [sourceUrl, setSourceUrl] = useState<string | null>(null)
  const [resultUrl, setResultUrl] = useState<string | null>(null)
  const [demoId, setDemoId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  async function run(file: File) {
    trackEvent("demo_started", { style })
    setError(null)
    setPhase("working")
    setSourceUrl(URL.createObjectURL(file))
    setResultUrl(null)
    try {
      const form = new FormData()
      form.append("photo", file)
      form.append("style", style)
      const res = await fetch("/api/try", { method: "POST", body: form })
      const body = await readJson<{ demo_id?: string; source_url?: string; result_url?: string; error?: string }>(res)
      if (!res.ok || !body?.result_url) {
        setPhase("idle")
        setError(body?.error ?? "That didn't work — try another photo.")
        return
      }
      setDemoId(body.demo_id ?? null)
      setSourceUrl(body.source_url ?? null)
      setResultUrl(body.result_url)
      setPhase("done")
      trackEvent("demo_completed", { style })
    } catch {
      setPhase("idle")
      setError("Something went wrong — give it another try.")
    }
  }

  function onFile(files: FileList | null) {
    const f = files?.[0]
    if (f) void run(f)
  }

  const signupHref = demoId
    ? `/auth/signup?segment=personal&redirect=${encodeURIComponent(`/character/new?demo=${demoId}`)}`
    : "/auth/signup?segment=personal"

  return (
    <div className={compact ? "" : "mx-auto w-full max-w-xl"}>
      {phase !== "done" && (
        <>
          <div
            role="button"
            tabIndex={0}
            aria-label="Add a photo to see yourself as a cartoon"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") inputRef.current?.click() }}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); onFile(e.dataTransfer.files) }}
            className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
              dragOver ? "border-violet-500 bg-violet-50" : "border-zinc-300 bg-white hover:border-violet-400"
            }`}
          >
            {phase === "working" ? (
              <>
                {sourceUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={sourceUrl} alt="Your photo" className="mb-3 h-20 w-20 rounded-lg object-cover" />
                )}
                <p className="text-sm font-medium text-zinc-700">Drawing your cartoon…</p>
                <p className="mt-1 text-xs text-zinc-500">about 15 seconds</p>
              </>
            ) : (
              <>
                <p className="text-base font-semibold text-zinc-800">See yourself as a cartoon</p>
                <p className="mt-1 text-sm text-zinc-500">Drop a photo here or tap to choose one. Free, no account.</p>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFile(e.target.files)}
          />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStyle(s.id)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  style === s.id ? "border-violet-500 bg-violet-50 text-violet-700" : "border-zinc-200 text-zinc-600 hover:border-zinc-300"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
          {error && <p className="mt-3 text-center text-sm text-red-600" role="alert">{error}</p>}
          <p className="mt-3 text-center text-xs text-zinc-400">
            Photos are only used to draw your preview and are deleted within 24 hours.
          </p>
        </>
      )}

      {phase === "done" && sourceUrl && resultUrl && (
        <div>
          <div className="grid grid-cols-2 gap-3">
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sourceUrl} alt="Your photo" className="aspect-square w-full rounded-xl object-cover" />
              <figcaption className="mt-1 text-center text-xs text-zinc-500">Your photo</figcaption>
            </figure>
            <figure>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultUrl} alt="Your cartoon" className="aspect-square w-full rounded-xl object-cover" />
              <figcaption className="mt-1 text-center text-xs text-zinc-500">Your cartoon</figcaption>
            </figure>
          </div>
          <div className="mt-4 flex flex-col items-center gap-2">
            <a
              href={signupHref}
              className="w-full rounded-lg bg-violet-600 px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-violet-700 sm:w-auto"
            >
              Make this into a video — free
            </a>
            <button
              type="button"
              onClick={() => { setPhase("idle"); setSourceUrl(null); setResultUrl(null); setDemoId(null) }}
              className="text-xs text-zinc-500 underline-offset-2 hover:underline"
            >
              Try another photo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
