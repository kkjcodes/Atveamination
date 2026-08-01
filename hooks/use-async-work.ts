"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { UserFacingError } from "@/lib/async-work/errors"

// Client-side polling hook for any long-running server-side operation.
// Replaces the ad-hoc `while (true) { await sleep; await fetch(...) }`
// patterns each module reinvented — each with different (usually broken)
// error handling for auth expiration, network drops, and total timeouts.
//
// Per code-review guidance: after repeated failures the UI should say
// "we can't check right now, your work is saved" instead of spinning
// forever. Auth 401 should route to /auth/login with a return URL.

export type AsyncWorkStatus =
  | "idle"
  | "polling"
  | "success"
  | "failed"
  | "timeout"
  | "network_error"
  | "auth_expired"

export type UseAsyncWorkParams<T> = {
  // Enables polling. Set false to pause (component unmount not required).
  enabled: boolean
  // Returns the current server state.
  fetchStatus: () => Promise<Response>
  // Given a successful response body, extract the domain object.
  parseData: (body: unknown) => T
  // Given the domain object, classify it into a polling state.
  // Return "processing" to continue polling, "success" to stop as ready,
  // "failed" to stop with an error state.
  classify: (data: T) => "processing" | "success" | "failed"
  // For "failed" states, extract a user-facing error.
  extractError?: (data: T) => UserFacingError | null
  // Poll interval in ms. Default 4000 — long enough not to hammer the DB,
  // short enough that state changes feel responsive.
  intervalMs?: number
  // Absolute timeout in ms before we give up. Default 15 minutes — long
  // enough for character training, short enough that we don't spin forever
  // on a truly stuck row.
  timeoutMs?: number
  // How many consecutive network failures before we surface "can't check right now".
  // Default 3 (~12s at 4s interval).
  networkFailureThreshold?: number
  // Called on 401. Default: no-op (caller can redirect).
  onAuthExpired?: () => void
}

export type UseAsyncWorkResult<T> = {
  data: T | null
  status: AsyncWorkStatus
  error: UserFacingError | null
  // Manual retry — resets network_error / timeout state and resumes polling.
  retry: () => void
}

export function useAsyncWork<T>(params: UseAsyncWorkParams<T>): UseAsyncWorkResult<T> {
  const {
    enabled,
    fetchStatus,
    parseData,
    classify,
    extractError,
    intervalMs = 4000,
    timeoutMs = 15 * 60 * 1000,
    networkFailureThreshold = 3,
    onAuthExpired,
  } = params

  const [data, setData] = useState<T | null>(null)
  const [status, setStatus] = useState<AsyncWorkStatus>(enabled ? "polling" : "idle")
  const [error, setError] = useState<UserFacingError | null>(null)

  const startTimeRef = useRef<number>(0)
  const networkFailCountRef = useRef<number>(0)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelRef = useRef(false)

  const retry = useCallback(() => {
    startTimeRef.current = 0 // reset in the effect on the next polling cycle
    networkFailCountRef.current = 0
    setError(null)
    setStatus("polling")
  }, [])

  // Transition effect: when `enabled` flips false→true from a non-polling
  // state (idle or a prior terminal state), reset back to "polling" so the
  // poll effect below actually starts. Also handles true→false → sets idle.
  // Without this the hook silently stays in "idle" or the terminal state
  // even though the caller re-enabled it. Split from the poll effect so its
  // reruns don't restart polling on every render.
  //
  // The set-state-in-effect eslint warning here is intentional — this IS
  // the "syncing external prop into internal state" pattern the rule
  // acknowledges as legitimate. Alternatives (deriving pollingActive during
  // render) don't compose with retry() which needs to force status=polling
  // from terminal states.
  useEffect(() => {
    if (!enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStatus("idle")
      return
    }
    // Only auto-transition FROM idle. Terminal states (success/failed/etc)
    // require explicit retry() so we don't clobber a completed result just
    // because a parent re-rendered with enabled still true.
    setStatus((prev) => (prev === "idle" ? "polling" : prev))
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    if (status !== "polling") return

    cancelRef.current = false
    // Initialize the deadline once per polling session — set here inside the
    // effect (not during render) so React strict-mode double-invocations
    // don't reset it mid-flight.
    if (startTimeRef.current === 0) {
      startTimeRef.current = Date.now()
    }

    const poll = async () => {
      if (cancelRef.current) return

      // Absolute timeout across all attempts. Prevents forever-spinning
      // on rows that got stuck at status="processing" without any status
      // updates coming through.
      if (Date.now() - startTimeRef.current > timeoutMs) {
        setStatus("timeout")
        setError({
          code: "provider_timeout",
          message: "This is taking longer than expected.",
          savedState: "Your work is saved.",
          nextAction: "Refresh the page in a few minutes to check on it, or try again.",
          retryable: true,
        })
        return
      }

      try {
        const res = await fetchStatus()
        // Component unmounted / re-render torn down the effect while we were
        // waiting on fetch. Skip all further state mutations.
        if (cancelRef.current) return

        if (res.status === 401) {
          setStatus("auth_expired")
          setError({
            code: "auth_expired",
            message: "You've been signed out. Sign in again to continue.",
            retryable: false,
          })
          onAuthExpired?.()
          return
        }

        if (!res.ok) {
          networkFailCountRef.current += 1
          if (networkFailCountRef.current >= networkFailureThreshold) {
            setStatus("network_error")
            setError({
              code: "network",
              message: "We can't check progress right now.",
              savedState: "Your work is still saved.",
              nextAction: "Try again in a moment.",
              retryable: true,
            })
            return
          }
          timeoutRef.current = setTimeout(poll, intervalMs)
          return
        }

        // Successful HTTP — reset the network failure counter.
        networkFailCountRef.current = 0

        const body = await res.json()
        if (cancelRef.current) return
        const parsed = parseData(body)
        setData(parsed)

        const outcome = classify(parsed)
        if (outcome === "success") {
          setStatus("success")
          return
        }
        if (outcome === "failed") {
          setStatus("failed")
          setError(extractError?.(parsed) ?? {
            code: "internal",
            message: "Something went wrong.",
            savedState: "Your inputs are saved.",
            nextAction: "Try again.",
            retryable: true,
          })
          return
        }
        // Still processing — schedule next poll.
        timeoutRef.current = setTimeout(poll, intervalMs)
      } catch {
        networkFailCountRef.current += 1
        if (networkFailCountRef.current >= networkFailureThreshold) {
          setStatus("network_error")
          setError({
            code: "network",
            message: "We can't reach the server.",
            savedState: "Your work is still saved.",
            nextAction: "Check your connection and try again.",
            retryable: true,
          })
          return
        }
        timeoutRef.current = setTimeout(poll, intervalMs)
      }
    }

    poll()

    return () => {
      cancelRef.current = true
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [enabled, status, fetchStatus, parseData, classify, extractError, intervalMs, timeoutMs, networkFailureThreshold, onAuthExpired])

  return { data, status, error, retry }
}
