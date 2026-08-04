"use client"

import { useRef, useState } from "react"

// Click-to-play hero video with poster, controls after play, and pause
// behavior. Autoplay-muted-no-controls kept users from replaying, pausing,
// or hearing audio — this fixes that without regressing performance
// (preload="none" means the ~500KB video only downloads on click).
export function HeroVideo({
  src,
  poster,
  label,
  aspectClass = "aspect-video",
  fit = "cover",
}: {
  src: string
  poster: string
  label: string
  aspectClass?: string
  // "contain" letterboxes the video inside the container — required for
  // vertical (9:16) videos in a 16:9 slot, where object-cover crops away
  // most of the frame including captions.
  fit?: "cover" | "contain"
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  function handlePlay() {
    setPlaying(true)
    videoRef.current?.play().catch(() => setPlaying(false))
  }

  return (
    <div className={`group relative overflow-hidden bg-zinc-900 ${aspectClass}`}>
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="none"
        playsInline
        controls={playing}
        onEnded={() => setPlaying(false)}
        className={`h-full w-full ${fit === "contain" ? "object-contain" : "object-cover"}`}
      />
      {!playing && (
        <button
          type="button"
          onClick={handlePlay}
          aria-label={label}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/30 transition hover:bg-black/20"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/95 shadow-lg transition group-hover:scale-110">
            <svg className="ml-0.5 h-6 w-6 text-violet-700" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="text-xs font-medium text-white/95 drop-shadow">{label}</span>
        </button>
      )}
    </div>
  )
}
