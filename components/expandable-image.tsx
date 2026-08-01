"use client"

import { useEffect, useState } from "react"

// Wraps a cartoon image with:
//   - A click-to-expand affordance that opens a full-size lightbox
//   - Corner buttons (expand + download) on hover, matching existing zinc/violet chrome
//   - Download works cross-origin (fetch → Blob → objectURL — Azure blob CDN
//     ignores the plain <a download> attribute)
//
// Usage:
//   <ExpandableImage src={url} alt="..." filename="kumar_pixar.jpg" />
//
// Wrap in a `relative` sized container — this component fills its parent.
export default function ExpandableImage({
  src,
  alt,
  filename,
  className = "",
  fit = "cover",
}: {
  src: string
  alt: string
  filename: string
  className?: string
  fit?: "cover" | "contain"
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [open])

  async function download(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(src)
      if (!res.ok) throw new Error(`fetch ${res.status}`)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(objectUrl), 100)
    } catch (e) {
      setErr((e as Error)?.message ?? "Failed")
    } finally {
      setBusy(false)
    }
  }

  const objectFit = fit === "contain" ? "object-contain" : "object-cover"

  return (
    <>
      <div className="group relative w-full h-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className={`w-full h-full ${objectFit} cursor-zoom-in ${className}`}
          onClick={() => setOpen(true)}
        />
        <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(true) }}
            className="inline-flex items-center gap-1 text-xs font-medium bg-white/90 hover:bg-white text-zinc-700 hover:text-violet-700 rounded-md px-2 py-1 shadow-sm border border-zinc-200 transition-colors"
            title="Expand"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M4 4h5a1 1 0 0 1 0 2H6v3a1 1 0 1 1-2 0V4Zm0 12v-3a1 1 0 1 1 2 0v3h3a1 1 0 1 1 0 2H4v-2Zm12 0h-3a1 1 0 1 1 0-2h3v-3a1 1 0 1 1 2 0v5h-2Zm2-12v3a1 1 0 1 1-2 0V6h-3a1 1 0 1 1 0-2h5Z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={download}
            disabled={busy}
            className="inline-flex items-center gap-1 text-xs font-medium bg-white/90 hover:bg-white text-zinc-700 hover:text-violet-700 rounded-md px-2 py-1 shadow-sm border border-zinc-200 transition-colors disabled:opacity-60"
            title={err ? `Download failed: ${err}` : "Download"}
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path d="M10 3a1 1 0 0 1 1 1v7.586l2.293-2.293a1 1 0 0 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L9 11.586V4a1 1 0 0 1 1-1Zm-6 12a1 1 0 0 1 1 1v.5A.5.5 0 0 0 5.5 17h9a.5.5 0 0 0 .5-.5V16a1 1 0 1 1 2 0v.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 16.5V16a1 1 0 0 1 1-1Z" />
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div className="relative max-w-6xl w-full max-h-[92vh]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={alt} className="w-full max-h-[92vh] object-contain rounded-lg shadow-2xl" />
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                type="button"
                onClick={download}
                disabled={busy}
                className="inline-flex items-center gap-1.5 text-sm font-medium bg-white hover:bg-zinc-50 text-zinc-800 rounded-lg px-3 py-1.5 shadow-lg transition-colors disabled:opacity-60"
              >
                <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                  <path d="M10 3a1 1 0 0 1 1 1v7.586l2.293-2.293a1 1 0 0 1 1.414 1.414l-4 4a1 1 0 0 1-1.414 0l-4-4a1 1 0 1 1 1.414-1.414L9 11.586V4a1 1 0 0 1 1-1Zm-6 12a1 1 0 0 1 1 1v.5A.5.5 0 0 0 5.5 17h9a.5.5 0 0 0 .5-.5V16a1 1 0 1 1 2 0v.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 16.5V16a1 1 0 0 1 1-1Z" />
                </svg>
                {busy ? "Downloading…" : "Download"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1 text-sm font-medium bg-white hover:bg-zinc-50 text-zinc-800 rounded-lg px-3 py-1.5 shadow-lg transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            {err && <p className="absolute bottom-3 left-3 text-xs text-red-200 bg-red-900/50 rounded px-2 py-1">Download failed: {err}</p>}
          </div>
        </div>
      )}
    </>
  )
}
