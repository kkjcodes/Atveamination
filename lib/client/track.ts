"use client"

// Client-side funnel tracking (D1). One anonymous session id per browser
// (localStorage), events fired via sendBeacon so they never block
// navigation. Fire-and-forget by design — tracking must never break a page.
export function trackEvent(name: string, props: Record<string, unknown> = {}): void {
  try {
    let sid = localStorage.getItem("atrk_sid")
    if (!sid) {
      sid = crypto.randomUUID()
      localStorage.setItem("atrk_sid", sid)
    }
    const payload = JSON.stringify({ name, sid, props })
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }))
    } else {
      void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true })
    }
  } catch {
    // never break the page for telemetry
  }
}
