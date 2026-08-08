"use client"

import { use, useCallback, useEffect, useState } from "react"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import type { AdScript } from "@/lib/business/adscript-schema"
import { useAsyncWork } from "@/hooks/use-async-work"
import { AsyncWorkStatus } from "@/components/async-work-status"
import { GenerationLoader } from "@/components/generation-loader"
import { ASYNC_WORK_COPY } from "@/lib/copy"
import { spinsForDate } from "@/lib/business/spins"
import type { AsyncErrorCode } from "@/lib/async-work/errors"

type AdVersion = {
  id: string
  versionNo: number
  editRequest: string | null
  createdAt: string
  adScript: AdScript
}

type Ad = {
  id: string
  status: "draft" | "rendering" | "ready" | "failed"
  templateFamily: string
  aspectRatio: string
  currentVersion: number
  galleryOptIn: boolean
  adScript: AdScript | null
  renderFailureCode: string | null
  renderFailureMessage: string | null
  finalVideoUrl: string | null
  versions: AdVersion[]
  business: { id: string; name: string }
}

export default function AdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: adId } = use(params)
  const [error, setError] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [busy, setBusy] = useState<"edit" | "render" | "revert" | "regenerate" | null>(null)
  const [selectedVersion, setSelectedVersion] = useState<number | null>(null)

  // Central polling loop for the ad. Replaces the old setTimeout(load, 5000)
  // that had no timeout, no auth handling, no network-error state.
  const fetchStatus = useCallback(() => fetch(`/api/business/ads/${adId}`), [adId])
  const parseData = useCallback((body: unknown) => {
    const fresh = (body as { ad: Ad }).ad
    if (selectedVersion === null) setSelectedVersion(fresh.currentVersion)
    return fresh
  }, [selectedVersion])
  const classify = useCallback((a: Ad): "processing" | "success" | "failed" => {
    if (a.status === "rendering") return "processing"
    return "success"  // ready/draft/failed — no polling needed
  }, [])
  const onAuthExpired = useCallback(() => {
    window.location.href = `/auth/login?return=${encodeURIComponent(`/business/ads/${adId}`)}`
  }, [adId])

  const {
    data: ad,
    status: pollStatus,
    error: pollError,
    retry: refetch,
  } = useAsyncWork<Ad>({
    enabled: true,
    fetchStatus,
    parseData,
    classify,
    intervalMs: 4000,
    timeoutMs: 8 * 60 * 1000,  // renders are 60-120s, 8min gives generous slack
    onAuthExpired,
  })

  // A stuck-but-alive render (e.g. slow TTS provider) shouldn't dead-end at
  // the poll timeout — keep checking every 30s while the page stays open.
  useEffect(() => {
    if (pollStatus !== "timeout" || ad?.status !== "rendering") return
    const t = setTimeout(() => refetch(), 30000)
    return () => clearTimeout(t)
  }, [pollStatus, ad?.status, refetch])

  async function submitEditRequest(requestText: string) {
    setBusy("edit")
    setError(null)
    try {
      const res = await fetch(`/api/business/ads/${adId}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ editRequest: requestText }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Edit failed")
      }
      setEditText("")
      setSelectedVersion(null)  // let load() pick the fresh currentVersion
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Edit failed")
    } finally {
      setBusy(null)
    }
  }

  async function submitEdit() {
    if (!editText.trim()) return
    await submitEditRequest(editText.trim())
  }

  const [sizeVariants, setSizeVariants] = useState<Array<{ id: string; aspectRatio: string }>>([])
  const [makingSizes, setMakingSizes] = useState(false)
  async function makeAllSizes() {
    setMakingSizes(true)
    setError(null)
    try {
      const res = await fetch(`/api/business/ads/${adId}/variants`, { method: "POST" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body?.error ?? "Couldn't create the other sizes.")
      // Kick off a render for each sibling; their pages show live progress.
      for (const v of body.created ?? []) {
        await fetch(`/api/business/ads/${v.id}/render`, { method: "POST" }).catch(() => {})
      }
      setSizeVariants(body.created ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the other sizes.")
    } finally {
      setMakingSizes(false)
    }
  }

  async function render() {
    setBusy("render")
    setError(null)
    try {
      const res = await fetch(`/api/business/ads/${adId}/render`, { method: "POST" })
      if (!res.ok) {
        let msg = "Couldn't start the render."
        try { const d = await res.json(); msg = d.error ?? msg } catch { /* keep default */ }
        throw new Error(msg)
      }
      // 202 Accepted: render runs in background. The poll loop will pick up
      // the status transition. Old code expected finalVideoUrl in the body —
      // that only shows up after the background render completes.
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start the render.")
    } finally {
      setBusy(null)
    }
  }

  async function regenerate() {
    setBusy("regenerate")
    setError(null)
    try {
      const res = await fetch(`/api/business/ads/${adId}/regenerate`, { method: "POST" })
      if (!res.ok) {
        let msg = "Couldn't regenerate the ad."
        try { const d = await res.json(); msg = d.error ?? msg } catch { /* keep default */ }
        throw new Error(msg)
      }
      setSelectedVersion(null)
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't regenerate the ad.")
    } finally {
      setBusy(null)
    }
  }

  async function revert(versionNo: number) {
    setBusy("revert")
    setError(null)
    try {
      const res = await fetch(`/api/business/ads/${adId}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionNo }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? "Revert failed")
      }
      setSelectedVersion(null)
      refetch()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revert failed")
    } finally {
      setBusy(null)
    }
  }

  async function toggleGallery() {
    if (!ad) return
    await fetch(`/api/business/ads/${adId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ galleryOptIn: !ad.galleryOptIn }),
    })
    refetch()
  }

  const loading = ad === null && pollStatus === "polling"
  const isPollTerminal = pollStatus === "timeout" || pollStatus === "network_error" || pollStatus === "auth_expired"

  if (loading) return <PageChrome><p className="text-zinc-400">Loading…</p></PageChrome>
  if (!ad) return <PageChrome><p className="text-zinc-500">Ad not found.</p></PageChrome>

  const activeVersion = ad.versions.find((v) => v.versionNo === (selectedVersion ?? ad.currentVersion))
    ?? ad.versions[ad.versions.length - 1]
  const isBusy = busy !== null || ad.status === "rendering"
  // "Try writing the ad again" is offered when we have an Ad row but no
  // valid script yet — either draft (never generated) or failed (Sonnet
  // returned an unparseable / repair-exhausted response).
  const needsRegenerate = ad.currentVersion === 0 && (ad.status === "draft" || ad.status === "failed")

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[
        { label: "Business", href: "/business" },
        { label: ad.business.name, href: `/business` },
        { label: `Ad v${activeVersion?.versionNo ?? "?"}` },
      ]} />
      <div className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
        {/* Main column */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-zinc-900">
              {ad.business.name} — {ad.templateFamily.replace("_", " ")} · {ad.aspectRatio}
            </h1>
            <StatusBadge status={ad.status} />
          </div>

          {error && (
            <div role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* Poll loop gave up (network/timeout/auth). If the ad was in the
              middle of rendering, refetch alone can't recover — the server's
              stale reclaim only fires on a fresh POST to /render, and the
              Make Video button stays disabled while status=rendering. Call
              render() so the reclaim path is reachable. Also re-arm the poll
              loop via refetch(). */}
          {isPollTerminal && (
            <AsyncWorkStatus
              status={pollStatus}
              error={
                pollStatus === "timeout" && ad.status === "rendering"
                  ? {
                      code: "provider_timeout",
                      message: "The video service is busier than usual, so this render is slow. We'll keep checking automatically while you're here.",
                      savedState: "Your ad script is saved.",
                      nextAction: "You can also try again now, or come back later.",
                      retryable: true,
                    }
                  : pollError
              }
              copy={ASYNC_WORK_COPY.businessRender}
              onRetry={() => {
                refetch()
                if (ad.status === "rendering") {
                  void render()
                }
              }}
            />
          )}

          {/* Active render — announce it. */}
          {ad.status === "rendering" && !isPollTerminal && (
            <AsyncWorkStatus
              status="polling"
              error={null}
              copy={ASYNC_WORK_COPY.businessRender}
            />
          )}

          {/* Render failed. Render endpoint persisted a mapped failure message. */}
          {ad.status === "failed" && ad.renderFailureMessage && (
            <AsyncWorkStatus
              status="failed"
              error={{
                code: (ad.renderFailureCode as AsyncErrorCode) ?? "internal",
                message: ad.renderFailureMessage,
                savedState: "Your ad script is saved.",
                nextAction: "Try making the video again.",
                retryable: true,
              }}
              copy={ASYNC_WORK_COPY.businessRender}
              onRetry={render}
            />
          )}

          {/* No script yet — H4 fix. */}
          {needsRegenerate && (
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-zinc-700">
                  We saved your choices (template, aspect, voice) but couldn&apos;t write the ad the first time.
                </p>
                <Button
                  className="mt-3"
                  onClick={regenerate}
                  disabled={isBusy}
                >
                  {busy === "regenerate" ? "Writing the ad…" : "Try writing the ad again"}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Player. Rendering wins over the old video — a re-render should
              show the loader, not last time's clip sitting there looking
              like nothing is happening. */}
          <Card>
            <CardContent className="p-4">
              {ad.status === "rendering" ? (
                <GenerationLoader className="aspect-video" message="Making your video… usually 1–2 minutes" />
              ) : ad.finalVideoUrl ? (
                <>
                  <video src={ad.finalVideoUrl} controls className="w-full rounded-lg bg-black" />
                  <div className="mt-3 flex items-center gap-3">
                    <a
                      href={`/api/business/ads/${adId}/download`}
                      className="text-sm font-medium text-violet-600 hover:text-violet-700"
                    >
                      Download video
                    </a>
                    <label className="ml-auto flex items-center gap-2 text-xs text-zinc-600 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={ad.galleryOptIn}
                        onChange={toggleGallery}
                        className="rounded"
                      />
                      Show in public gallery
                    </label>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {sizeVariants.length === 0 ? (
                      <Button size="sm" variant="outline" onClick={makeAllSizes} disabled={makingSizes || isBusy}>
                        {makingSizes ? "Setting up sizes…" : "Make all 3 sizes — Reels, Feed, YouTube"}
                      </Button>
                    ) : (
                      sizeVariants.map((v) => (
                        <a
                          key={v.id}
                          href={`/business/ads/${v.id}`}
                          className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
                        >
                          {v.aspectRatio} version →
                        </a>
                      ))
                    )}
                  </div>
                </>
              ) : (
                <div className="aspect-video rounded-lg bg-zinc-900 flex items-center justify-center text-zinc-400 text-sm">
                  No video yet. Tap Make a video below.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Iterate */}
          <Card>
            <CardContent className="p-4">
              <label className="text-sm font-medium text-zinc-700 block mb-2">
                What would you change?
              </label>
              <div className="mb-2 flex flex-wrap gap-2">
                {spinsForDate(new Date()).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={isBusy}
                    onClick={() => submitEditRequest(s.editRequest)}
                    className="rounded-full border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-600 hover:border-amber-400 hover:text-amber-700 disabled:opacity-40"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder="Shorter headline. Swap the first photo. Use a deeper voice."
                rows={3}
                disabled={isBusy}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  onClick={submitEdit}
                  disabled={isBusy || !editText.trim()}
                >
                  {busy === "edit" ? "Updating…" : "Update the ad"}
                </Button>
                <Button
                  onClick={render}
                  disabled={isBusy || !ad.adScript}
                  variant="outline"
                >
                  {busy === "render" || ad.status === "rendering" ? "Making video…" : "Make video"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Current script preview */}
          {activeVersion && <ScriptPreview script={activeVersion.adScript} />}
        </div>

        {/* Version sidebar */}
        <aside>
          <div className="sticky top-16">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-2 px-1">
              History
            </h3>
            <div className="space-y-1">
              {ad.versions.slice().reverse().map((v) => {
                const isActive = v.versionNo === (selectedVersion ?? ad.currentVersion)
                const isCurrent = v.versionNo === ad.currentVersion
                return (
                  <div key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedVersion(v.versionNo)}
                      disabled={isBusy}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        isActive
                          ? "border-violet-400 bg-violet-50"
                          : "border-zinc-200 hover:border-zinc-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-zinc-800">v{v.versionNo}</span>
                        {isCurrent && (
                          <span className="text-xs text-violet-600 font-medium">current</span>
                        )}
                      </div>
                      <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">
                        {v.editRequest ?? "Original"}
                      </p>
                    </button>
                    {isActive && !isCurrent && (
                      <button
                        type="button"
                        onClick={() => revert(v.versionNo)}
                        disabled={isBusy}
                        className="ml-1 mt-1 text-xs text-violet-600 hover:text-violet-800 disabled:opacity-60"
                      >
                        ↺ Revert to v{v.versionNo}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

function PageChrome({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <div className="mx-auto max-w-4xl p-12 text-center">{children}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: Ad["status"] }) {
  const cls =
    status === "ready"     ? "bg-green-50 text-green-700" :
    status === "rendering" ? "bg-violet-50 text-violet-700 animate-pulse" :
    status === "failed"    ? "bg-red-50 text-red-600" :
                             "bg-zinc-100 text-zinc-500"
  return (
    <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${cls}`}>{status}</span>
  )
}

function ScriptPreview({ script }: { script: AdScript }) {
  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="text-sm font-semibold text-zinc-800 mb-3">Script</h3>
        <div className="space-y-2 text-sm">
          {script.scenes.map((s, i) => (
            <div key={i} className="flex gap-3 py-2 border-t border-zinc-100 first:border-t-0">
              <span className="text-xs font-mono font-semibold text-zinc-400 bg-zinc-100 rounded px-2 py-0.5 h-fit shrink-0">
                {s.type}
              </span>
              <div className="flex-1 min-w-0">
                {s.type !== "end_card" && (
                  <>
                    <p className="font-semibold text-zinc-900">{s.text}</p>
                    <p className="text-xs italic text-zinc-500 mt-0.5">&ldquo;{s.vo_text}&rdquo;</p>
                    {s.pronunciation_hint && (
                      <p className="text-xs text-amber-600 mt-0.5">say-as: {s.pronunciation_hint}</p>
                    )}
                  </>
                )}
                {s.type === "end_card" && (
                  <div className="space-y-0.5">
                    {s.lines.map((l, li) => (
                      <p key={li} className={li === 0 ? "font-bold text-zinc-900" : "text-zinc-600"}>
                        {l}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
