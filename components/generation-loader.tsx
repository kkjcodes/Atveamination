// Shared "something is happening" placeholder for the three video-generation
// flows (personal scenes, business ads, scrapbook stitch). A static text line
// reads as frozen during a 1-3 minute wait — the spinner + pulse gives users
// visible motion for the whole render.
export function GenerationLoader({ message, className = "" }: { message: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 rounded-lg bg-zinc-900 text-sm text-zinc-400 ${className}`}
    >
      <svg className="h-9 w-9 animate-spin text-violet-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
      </svg>
      <span className="animate-pulse">{message}</span>
    </div>
  )
}
