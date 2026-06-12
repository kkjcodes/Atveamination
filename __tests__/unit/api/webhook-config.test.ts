import { describe, it, expect } from "vitest"

// Pure logic extracted from app/api/webhooks/replicate/route.ts and
// app/api/scenes/[id]/generate/route.ts — no mocking needed.

function getReplicateWebhookConfig(appUrl: string | undefined) {
  if (!appUrl || appUrl.includes("localhost")) return {}
  return {
    webhook: `${appUrl}/api/webhooks/replicate`,
    webhook_events_filter: ["completed"],
  }
}

function getFalWebhookUrl(appUrl: string | undefined): string | undefined {
  if (!appUrl || appUrl.includes("localhost")) return undefined
  return `${appUrl}/api/webhooks/fal`
}

// ── getReplicateWebhookConfig ─────────────────────────────────────────────────

describe("getReplicateWebhookConfig", () => {
  it("returns {} when appUrl is undefined", () => {
    expect(getReplicateWebhookConfig(undefined)).toEqual({})
  })

  it("returns {} when appUrl is localhost", () => {
    expect(getReplicateWebhookConfig("http://localhost:3000")).toEqual({})
  })

  it("returns {} when appUrl contains localhost with a path", () => {
    expect(getReplicateWebhookConfig("http://localhost:3000/some/path")).toEqual({})
  })

  it("returns webhook config for a prod URL", () => {
    const result = getReplicateWebhookConfig("https://myapp.azurecontainerapps.io")
    expect(result).toEqual({
      webhook: "https://myapp.azurecontainerapps.io/api/webhooks/replicate",
      webhook_events_filter: ["completed"],
    })
  })

  it("webhook_events_filter contains exactly [\"completed\"]", () => {
    const result = getReplicateWebhookConfig("https://myapp.azurecontainerapps.io") as {
      webhook_events_filter: string[]
    }
    expect(result.webhook_events_filter).toEqual(["completed"])
    expect(result.webhook_events_filter).toHaveLength(1)
  })

  it("does not add a trailing slash to the base URL", () => {
    const result = getReplicateWebhookConfig("https://prod.example.com") as {
      webhook: string
    }
    expect(result.webhook).toBe("https://prod.example.com/api/webhooks/replicate")
    expect(result.webhook).not.toMatch(/\/\/api/)
  })

  it("treats a non-localhost URL with a port as prod", () => {
    const result = getReplicateWebhookConfig("https://prod.example.com:8080")
    expect(result).toEqual({
      webhook: "https://prod.example.com:8080/api/webhooks/replicate",
      webhook_events_filter: ["completed"],
    })
  })
})

// ── getFalWebhookUrl ──────────────────────────────────────────────────────────

describe("getFalWebhookUrl", () => {
  it("returns undefined when appUrl is undefined", () => {
    expect(getFalWebhookUrl(undefined)).toBeUndefined()
  })

  it("returns undefined when appUrl is localhost", () => {
    expect(getFalWebhookUrl("http://localhost:3000")).toBeUndefined()
  })

  it("returns the fal webhook URL for a prod URL", () => {
    expect(getFalWebhookUrl("https://prod.example.com")).toBe(
      "https://prod.example.com/api/webhooks/fal"
    )
  })

  it("does not add a trailing slash to the base URL", () => {
    const url = getFalWebhookUrl("https://prod.example.com")!
    expect(url).toBe("https://prod.example.com/api/webhooks/fal")
    expect(url).not.toMatch(/\/\/api/)
  })

  it("treats a non-localhost URL with a port as prod", () => {
    expect(getFalWebhookUrl("https://prod.example.com:8080")).toBe(
      "https://prod.example.com:8080/api/webhooks/fal"
    )
  })
})
