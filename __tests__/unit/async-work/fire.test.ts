import { describe, it, expect, vi } from "vitest"
import { fireAndForget } from "@/lib/async-work/fire"

// fireAndForget runs work in the background; tests wait for the promise
// chain to flush via a poll on a done-flag inside the callback.
function flush(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe("fireAndForget", () => {
  it("runs work and calls onSuccess on success", async () => {
    let workRan = false
    let successRan = false
    fireAndForget({
      tag: "test/success",
      id: "abc",
      work: async () => { workRan = true },
      onError: async () => { /* not expected */ },
      onSuccess: async () => { successRan = true },
    })
    await flush()
    expect(workRan).toBe(true)
    expect(successRan).toBe(true)
  })

  it("calls onError with mapped error on failure", async () => {
    let onErrorCalled = false
    let receivedCode: string | undefined
    fireAndForget({
      tag: "test/fail",
      id: "abc",
      work: async () => { throw new Error("Unprocessable Entity") },
      onError: async (err) => {
        onErrorCalled = true
        receivedCode = err.code
      },
    })
    await flush()
    expect(onErrorCalled).toBe(true)
    expect(receivedCode).toBe("input_invalid")
  })

  it("does not blow up if onError itself throws", async () => {
    // Simulates DB failure inside the error handler. Should log but not crash.
    let workDone = false
    fireAndForget({
      tag: "test/onerror-throws",
      id: "abc",
      work: async () => { workDone = true; throw new Error("boom") },
      onError: async () => { throw new Error("db unreachable") },
    })
    await flush()
    expect(workDone).toBe(true)
    // No assertion needed — the point is the process didn't crash.
  })

  it("does not call onError on success", async () => {
    const onError = vi.fn()
    fireAndForget({
      tag: "test/no-error",
      id: "abc",
      work: async () => { /* success */ },
      onError,
    })
    await flush()
    expect(onError).not.toHaveBeenCalled()
  })

  it("returns without waiting for work to complete", async () => {
    let workCompleted = false
    fireAndForget({
      tag: "test/sync-return",
      id: "abc",
      work: async () => {
        await new Promise((r) => setTimeout(r, 200))
        workCompleted = true
      },
      onError: async () => {},
    })
    // fireAndForget returned but work is still in flight (200ms delay)
    expect(workCompleted).toBe(false)
    await flush(300)
    expect(workCompleted).toBe(true)
  })
})
