"use client"

// Standardized async-work status UI. Answers the 6 questions from the code
// review's UX contract for every long-running operation:
//   1. What is happening?
//   2. How long does it usually take?
//   3. Can I leave?
//   4. Is my input saved?
//   5. What happens if it fails?
//   6. What should I do next?
//
// Uses role="alert" for errors and aria-live="polite" for progress so
// screen readers announce state changes without stealing focus.

import type { UserFacingError } from "@/lib/async-work/errors"
import type { AsyncWorkStatus } from "@/hooks/use-async-work"

export type AsyncWorkCopy = {
  whatsHappening: string
  howLong: string
  canLeave: string
  savedState: string
  ifItFails: string
}

type Props = {
  status: AsyncWorkStatus
  error: UserFacingError | null
  copy: AsyncWorkCopy
  onRetry?: () => void
  onGoBack?: () => void
  className?: string
}

export function AsyncWorkStatus({ status, error, copy, onRetry, onGoBack, className }: Props) {
  if (status === "idle" || status === "success") return null

  // Working state — friendly progress card. aria-live so screen readers pick
  // it up without stealing focus from the user's current field.
  if (status === "polling") {
    return (
      <div
        aria-live="polite"
        aria-busy="true"
        className={`rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm text-violet-900 ${className ?? ""}`}
      >
        <div className="flex items-center gap-2 font-medium">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-violet-500" />
          {copy.whatsHappening}
        </div>
        <p className="mt-1 text-violet-700">{copy.howLong}</p>
        <p className="mt-1 text-xs text-violet-600">{copy.canLeave} · {copy.savedState}</p>
      </div>
    )
  }

  // Error state — role="alert" so it's announced immediately.
  const tone = status === "auth_expired" ? "amber" : "red"
  const bg = tone === "amber" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900"
  const btn = tone === "amber" ? "bg-amber-600 hover:bg-amber-700" : "bg-red-600 hover:bg-red-700"

  const title =
    status === "auth_expired" ? "Please sign in again"
    : status === "network_error" ? "We can't check progress right now"
    : status === "timeout" ? "This is taking longer than expected"
    : "Something went wrong"

  const savedState = error?.savedState ?? copy.savedState
  const nextAction = error?.nextAction ?? copy.ifItFails
  const canRetry = error?.retryable !== false && !!onRetry

  return (
    <div role="alert" className={`rounded-lg border p-4 text-sm ${bg} ${className ?? ""}`}>
      <p className="font-medium">{title}</p>
      {error?.message && <p className="mt-1">{error.message}</p>}
      {savedState && <p className="mt-1 text-xs opacity-80">{savedState}</p>}
      {nextAction && <p className="mt-1 text-xs opacity-80">{nextAction}</p>}
      {(canRetry || onGoBack) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {canRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`rounded px-3 py-1.5 text-xs font-medium text-white ${btn}`}
            >
              Try again
            </button>
          )}
          {onGoBack && (
            <button
              type="button"
              onClick={onGoBack}
              className="rounded border border-current px-3 py-1.5 text-xs font-medium"
            >
              Return to dashboard
            </button>
          )}
        </div>
      )}
    </div>
  )
}
