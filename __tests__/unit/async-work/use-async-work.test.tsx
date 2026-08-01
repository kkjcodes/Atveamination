/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"
import { useAsyncWork } from "@/hooks/use-async-work"

// Real timers with short intervals — trying to mix fake timers with React's
// async render + microtask + timer scheduling is a landmine. Short real
// intervals keep the suite fast without the coordination bugs.

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

const SHORT = { intervalMs: 20, timeoutMs: 5_000 }

describe("useAsyncWork lifecycle", () => {
  it("does not poll when enabled starts false", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(mockResponse(200, { data: 1 }))
    const { result } = renderHook(() =>
      useAsyncWork({
        enabled: false,
        fetchStatus,
        parseData: (b) => b,
        classify: () => "processing",
        ...SHORT,
      })
    )
    expect(result.current.status).toBe("idle")
    await new Promise((r) => setTimeout(r, 100))
    expect(fetchStatus).not.toHaveBeenCalled()
  })

  it("starts polling when enabled flips false→true", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(mockResponse(200, { phase: "processing" }))
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAsyncWork({
          enabled,
          fetchStatus,
          parseData: (b) => b,
          classify: () => "processing",
          ...SHORT,
        }),
      { initialProps: { enabled: false } }
    )
    expect(result.current.status).toBe("idle")

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.status).toBe("polling"))
    await waitFor(() => expect(fetchStatus).toHaveBeenCalled())
  })

  it("stops polling when enabled flips true→false", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(mockResponse(200, { phase: "processing" }))
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAsyncWork({
          enabled,
          fetchStatus,
          parseData: (b) => b,
          classify: () => "processing",
          ...SHORT,
        }),
      { initialProps: { enabled: true } }
    )
    await waitFor(() => expect(fetchStatus).toHaveBeenCalled())

    rerender({ enabled: false })
    await waitFor(() => expect(result.current.status).toBe("idle"))
    const callsAfterDisable = fetchStatus.mock.calls.length
    await new Promise((r) => setTimeout(r, 100))
    expect(fetchStatus.mock.calls.length).toBe(callsAfterDisable)
  })

  it("re-enables after false→true cycle following true→false", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(mockResponse(200, { phase: "processing" }))
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useAsyncWork({
          enabled,
          fetchStatus,
          parseData: (b) => b,
          classify: () => "processing",
          ...SHORT,
        }),
      { initialProps: { enabled: true } }
    )
    await waitFor(() => expect(fetchStatus).toHaveBeenCalled())

    rerender({ enabled: false })
    await waitFor(() => expect(result.current.status).toBe("idle"))
    const callsAfterDisable = fetchStatus.mock.calls.length

    rerender({ enabled: true })
    await waitFor(() => expect(result.current.status).toBe("polling"))
    await waitFor(() => expect(fetchStatus.mock.calls.length).toBeGreaterThan(callsAfterDisable))
  })

  it("transitions to success when classify returns 'success'", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(mockResponse(200, { phase: "done" }))
    const { result } = renderHook(() =>
      useAsyncWork({
        enabled: true,
        fetchStatus,
        parseData: (b) => b,
        classify: () => "success",
        ...SHORT,
      })
    )
    await waitFor(() => expect(result.current.status).toBe("success"))
  })

  it("classifies 401 as auth_expired and calls onAuthExpired", async () => {
    const onAuthExpired = vi.fn()
    const fetchStatus = vi.fn().mockResolvedValue(mockResponse(401, {}))
    const { result } = renderHook(() =>
      useAsyncWork({
        enabled: true,
        fetchStatus,
        parseData: (b) => b,
        classify: () => "processing",
        onAuthExpired,
        ...SHORT,
      })
    )
    await waitFor(() => expect(result.current.status).toBe("auth_expired"))
    expect(onAuthExpired).toHaveBeenCalledOnce()
  })

  it("flips to network_error after threshold consecutive failures", async () => {
    const fetchStatus = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    const { result } = renderHook(() =>
      useAsyncWork({
        enabled: true,
        fetchStatus,
        parseData: (b) => b,
        classify: () => "processing",
        intervalMs: 10,
        timeoutMs: 5_000,
        networkFailureThreshold: 3,
      })
    )
    await waitFor(() => expect(result.current.status).toBe("network_error"))
  })

  it("flips to timeout after timeoutMs elapses", async () => {
    const fetchStatus = vi.fn().mockResolvedValue(mockResponse(200, { phase: "processing" }))
    const { result } = renderHook(() =>
      useAsyncWork({
        enabled: true,
        fetchStatus,
        parseData: (b) => b,
        classify: () => "processing",
        intervalMs: 20,
        timeoutMs: 100,
      })
    )
    await waitFor(() => expect(result.current.status).toBe("timeout"), { timeout: 2000 })
  })

  it("retry() resumes polling after a failure state", async () => {
    let mode: "fail" | "processing" = "fail"
    const fetchStatus = vi.fn().mockImplementation(async () => {
      if (mode === "fail") throw new Error("ECONNREFUSED")
      return mockResponse(200, { phase: "processing" })
    })
    const { result } = renderHook(() =>
      useAsyncWork({
        enabled: true,
        fetchStatus,
        parseData: (b) => b,
        classify: () => "processing",
        intervalMs: 10,
        timeoutMs: 5_000,
        networkFailureThreshold: 2,
      })
    )
    await waitFor(() => expect(result.current.status).toBe("network_error"))
    const callsAtFailure = fetchStatus.mock.calls.length

    mode = "processing"
    act(() => result.current.retry())
    await waitFor(() => expect(fetchStatus.mock.calls.length).toBeGreaterThan(callsAtFailure))
    expect(["polling", "success"]).toContain(result.current.status)
  })
})
