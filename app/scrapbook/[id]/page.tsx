"use client"

import { useCallback, useState, use } from "react"
import Link from "next/link"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import ExpandableImage from "@/components/expandable-image"
import { STYLE_PRESETS, type ScrapbookStyle, COST_ESTIMATES } from "@/lib/scrapbook/config"
import { AsyncWorkStatus } from "@/components/async-work-status"
import { ASYNC_WORK_COPY, PRODUCT_TERMS } from "@/lib/copy"
import { useAsyncWork } from "@/hooks/use-async-work"
import type { AsyncErrorCode } from "@/lib/async-work/errors"

type PageRow = {
  id: string
  order_index?: number
  orderIndex: number
  sourcePhotoUrl: string
  beforeKeyframeUrl: string | null
  afterKeyframeUrl: string | null
  rawClipUrl: string | null
  pageVideoUrl: string | null
  route: string | null
  caption: string
  usedFallback: boolean
  costUsd: number
  generationPhase: string | null
  generationFailureMessage: string | null
  qcResult: { passed?: boolean; reason?: string } | null
}

type ProjectRow = {
  id: string
  title: string
  style: string
  status: string
  finalVideoUrl: string | null
  totalCostUsd: number
  stitchFailureCode: string | null
  stitchFailureMessage: string | null
  pages: PageRow[]
}

function phaseLabel(phase: string | null): { text: string; tone: "pending" | "processing" | "done" | "failed" } {
  switch (phase) {
    case "vision":     return { text: "Reading photo…",   tone: "processing" }
    case "before":     return { text: "Stylizing…",        tone: "processing" }
    case "after":      return { text: "Building motion…",  tone: "processing" }
    case "motion":     return { text: "Animating…",        tone: "processing" }
    case "qc":         return { text: "Checking…",         tone: "processing" }
    case "done":       return { text: "Done",              tone: "done" }
    case "failed":     return { text: "Didn't come out right", tone: "failed" }
    default:           return { text: "Waiting for you",   tone: "pending" }
  }
}

// User-facing route labels. No model acronyms — "RIFE" and "Ken Burns" mean
// nothing to a shop owner or grandparent.
function routeLabel(route: string | null): string {
  switch (route) {
    case "subtle":   return "Gentle motion"
    case "dynamic":  return "Big motion"
    case "fallback": return "Still photo"
    default:         return ""
  }
}

export default function ScrapbookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params)
  const [error, setError] = useState<string | null>(null)
  const [busyPage, setBusyPage] = useState<string | null>(null)
  const [stitching, setStitching] = useState(false)

  // Central polling loop for the project + all pages. useAsyncWork replaces
  // the old raw setTimeout loop: it now has proper 401 → sign-in handling,
  // network-failure classification (was: infinite spinner), a hard timeout
  // (was: infinite spinner), and a retry() we can wire to the retry button.
  const fetchStatus = useCallback(() => fetch(`/api/scrapbook/projects/${projectId}`), [projectId])
  const parseData = useCallback((body: unknown) => (body as { project: ProjectRow }).project, [])
  const classify = useCallback((p: ProjectRow): "processing" | "success" | "failed" => {
    const anyProcessing = p.pages.some((pp) => {
      const phase = pp.generationPhase
      return phase && !["done", "failed"].includes(phase)
    })
    if (anyProcessing || p.status === "generating") return "processing"
    return "success"
  }, [])
  const onAuthExpired = useCallback(() => {
    window.location.href = `/auth/login?return=${encodeURIComponent(`/scrapbook/${projectId}`)}`
  }, [projectId])

  const {
    data: project,
    status: pollStatus,
    error: pollError,
    retry: refetch,
  } = useAsyncWork<ProjectRow>({
    enabled: true,
    fetchStatus,
    parseData,
    classify,
    intervalMs: 4000,
    // Long tail — a fresh scrapbook can take 20+ minutes to generate all
    // 8 pages sequentially. Give the poll loop plenty of room before we
    // classify as "we can't tell if this is still running".
    timeoutMs: 30 * 60 * 1000,
    onAuthExpired,
  })

  // Any action the user takes needs to re-arm the poller. On success or
  // failure the poll effect halts; refetch() puts it back into "polling".
  const resumeAfterAction = refetch

  async function generatePage(pageId: string) {
    setBusyPage(pageId)
    setError(null)
    try {
      const res = await fetch(`/api/scrapbook/pages/${pageId}/generate`, { method: "POST" })
      if (!res.ok) {
        // Non-JSON gateway responses (rare 5xx HTML) shouldn't throw a
        // useless parser error — try JSON first, fall back to a text.
        let msg = "Generation failed"
        try {
          const data = await res.json()
          msg = data.error ?? msg
        } catch { /* keep default */ }
        throw new Error(msg)
      }
      resumeAfterAction()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed")
    } finally {
      setBusyPage(null)
    }
  }

  async function deletePage(pageId: string) {
    if (!confirm("Delete this page?")) return
    // Check res.ok — old code silently updated UI even on delete failure.
    const res = await fetch(`/api/scrapbook/pages/${pageId}`, { method: "DELETE" })
    if (!res.ok) {
      setError("Couldn't delete this page. Try again.")
      return
    }
    resumeAfterAction()
  }

  async function stitch() {
    if (!project) return
    setStitching(true)
    setError(null)
    try {
      const res = await fetch(`/api/scrapbook/projects/${project.id}/stitch`, { method: "POST" })
      if (!res.ok) {
        let msg = "Couldn't start creating the video."
        try {
          const data = await res.json()
          msg = data.error ?? msg
        } catch { /* keep default */ }
        throw new Error(msg)
      }
      resumeAfterAction()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start creating the video.")
    } finally {
      setStitching(false)
    }
  }

  const loading = project === null && pollStatus === "polling"
  const isPollTerminal = pollStatus === "timeout" || pollStatus === "network_error" || pollStatus === "auth_expired"

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <div className="mx-auto max-w-4xl px-6 py-10">
          <div className="animate-pulse space-y-6">
            <div>
              <div className="h-8 w-64 bg-zinc-200 rounded" />
              <div className="mt-2 h-4 w-40 bg-zinc-100 rounded" />
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="border border-zinc-200 bg-white rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-16 bg-zinc-200 rounded" />
                  <div className="h-4 w-20 bg-zinc-100 rounded" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="h-40 bg-zinc-100 rounded-lg" />
                  <div className="h-40 bg-zinc-100 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-400">Getting your pages ready…</p>
        </div>
      </div>
    )
  }
  if (!project) {
    return (
      <div className="min-h-screen bg-zinc-50">
        <Nav />
        <div className="mx-auto max-w-4xl p-12 text-center text-zinc-500">
          We couldn&apos;t find that scrapbook. It may have been deleted, or the link is off.
        </div>
      </div>
    )
  }

  const styleInfo = STYLE_PRESETS[project.style as ScrapbookStyle] ?? STYLE_PRESETS.watercolor
  const allDone = project.pages.length > 0 &&
    project.pages.every((p) => p.generationPhase === "done" || p.generationPhase === "failed")
  const anyProcessing = project.pages.some((p) => {
    const ph = p.generationPhase
    return ph && !["done", "failed"].includes(ph)
  })

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[
        { label: "Scrapbook", href: "/scrapbook" },
        { label: project.title },
      ]} />
      <div className="mx-auto max-w-4xl px-6 py-8 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">{project.title}</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {styleInfo.label} · {project.pages.length} {project.pages.length === 1 ? "page" : "pages"}
              {project.totalCostUsd > 0 && ` · $${project.totalCostUsd.toFixed(2)}`}
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/scrapbook">← All scrapbooks</Link>
          </Button>
        </div>

        {error && (
          <div role="alert" className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        {/* If the poll loop itself gave up (timeout, network, auth), surface
            a retry banner that:
              (1) re-arms the poll loop,
              (2) re-POSTs generate for every stuck page (server-side stale
                  reclaim only fires on a fresh POST — refetch alone would
                  keep the user watching "Still working…" forever),
              (3) re-POSTs stitch if the project itself is stuck at
                  status="generating" (H2 fix — same reachability gap).
            Without (2) and (3) the button would look responsive but do
            nothing productive. */}
        {isPollTerminal && (
          <AsyncWorkStatus
            status={pollStatus}
            error={pollError}
            copy={ASYNC_WORK_COPY.scrapbookStitch}
            onRetry={() => {
              refetch()
              const stuck = project?.pages.filter((p) => {
                const ph = p.generationPhase
                return ph && !["done", "failed"].includes(ph)
              }) ?? []
              stuck.forEach((p) => { void generatePage(p.id) })
              if (project?.status === "generating") {
                void stitch()
              }
            }}
          />
        )}

        {project?.status === "generating" && !isPollTerminal && (
          <AsyncWorkStatus
            status="polling"
            error={null}
            copy={ASYNC_WORK_COPY.scrapbookStitch}
          />
        )}
        {project?.status === "failed" && (
          <AsyncWorkStatus
            status="failed"
            error={{
              code: (project.stitchFailureCode as AsyncErrorCode) ?? "internal",
              message: project.stitchFailureMessage ?? "We couldn't create the final video.",
              savedState: "Your pages are saved.",
              nextAction: "Try creating the video again.",
              retryable: true,
            }}
            copy={ASYNC_WORK_COPY.scrapbookStitch}
            onRetry={stitch}
          />
        )}

        {project.finalVideoUrl && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="font-semibold text-zinc-900">Your scrapbook</p>
                <a
                  href={`/api/scrapbook/projects/${project.id}/download`}
                  className="text-sm font-medium text-violet-600 hover:text-violet-700"
                >
                  Download
                </a>
              </div>
              <video src={project.finalVideoUrl} controls className="w-full rounded-lg" />
            </CardContent>
          </Card>
        )}

        {project.pages.map((page, i) => {
          const phase = phaseLabel(page.generationPhase)
          const isBusy = busyPage === page.id || (page.generationPhase && !["done", "failed", null].includes(page.generationPhase))
          const routeText = routeLabel(page.route)
          const estCost = page.route === "dynamic"
            ? COST_ESTIMATES.perPageDynamic
            : page.route === "subtle"
              ? COST_ESTIMATES.perPageSubtle
              : COST_ESTIMATES.perPageFallback
          return (
            <Card key={page.id}>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-mono font-semibold text-zinc-400 bg-zinc-100 rounded px-2 py-0.5">
                    Page {i + 1}
                  </span>
                  <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${
                    phase.tone === "done" ? "text-green-700 bg-green-50" :
                    phase.tone === "failed" ? "text-red-600 bg-red-50" :
                    phase.tone === "processing" ? "text-violet-700 bg-violet-50 animate-pulse" :
                    "text-zinc-500 bg-zinc-100"
                  }`}>
                    {phase.text}
                  </span>
                  {routeText && (
                    <span className="text-xs text-zinc-500">{routeText}</span>
                  )}
                  {page.usedFallback && page.generationPhase === "done" && (
                    <span
                      title="This page uses a gentler animation because the AI wasn't sure how to move it. Tap Regenerate to try again."
                      className="text-xs font-medium text-amber-700 bg-amber-50 rounded-full px-2 py-0.5"
                    >
                      Simplified
                    </span>
                  )}
                  <div className="flex-1" />
                  <button
                    type="button"
                    onClick={() => deletePage(page.id)}
                    disabled={!!isBusy || stitching}
                    className="text-zinc-300 hover:text-red-400 text-xl leading-none disabled:opacity-40"
                    aria-label="Delete page"
                  >×</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Source photo</p>
                    <div className="relative rounded-lg border border-zinc-200 h-40 overflow-hidden bg-zinc-100">
                      <ExpandableImage
                        src={page.sourcePhotoUrl}
                        alt="Source photo"
                        filename={`page_${i + 1}_source.jpg`}
                      />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 mb-1">Rendered page</p>
                    {page.rawClipUrl ? (
                      <video src={page.rawClipUrl} controls className="w-full rounded-lg border border-zinc-200 max-h-48" />
                    ) : page.beforeKeyframeUrl ? (
                      <div className="relative rounded-lg border border-zinc-200 h-40 overflow-hidden bg-zinc-100">
                        <ExpandableImage
                          src={page.beforeKeyframeUrl}
                          alt="Before keyframe"
                          filename={`scrapbook_page_${i + 1}.jpg`}
                        />
                      </div>
                    ) : (
                      <div className="w-full rounded-lg border border-dashed border-zinc-200 h-40 flex items-center justify-center text-xs text-zinc-400">
                        {isBusy ? "Working on it…" : "Waiting for your go-ahead"}
                      </div>
                    )}
                  </div>
                </div>

                {page.caption && (
                  <p className="mt-3 text-sm italic text-zinc-600">&ldquo;{page.caption}&rdquo;</p>
                )}

                {/* Show the mapped failure message + a Retry action when the page
                    failed OR fell back. Users previously saw only "Simplified"
                    with no explanation of what went wrong or that retrying
                    costs more provider spend. */}
                {(page.generationPhase === "failed" || (page.generationPhase === "done" && page.usedFallback)) && page.generationFailureMessage && (
                  <div role="status" className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <p className="font-medium">{page.generationFailureMessage}</p>
                    <p className="mt-1 text-amber-700">
                      {page.generationPhase === "failed"
                        ? "Retry costs another generation."
                        : "This page will be a gentle still-photo motion in the final video. Retry to try full animation again."}
                    </p>
                  </div>
                )}

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-zinc-400">
                    {page.costUsd > 0 ? `$${page.costUsd.toFixed(2)}` : `~$${estCost.toFixed(2)}`}
                  </p>
                  {page.generationPhase !== "done" && (
                    <Button
                      size="sm"
                      onClick={() => generatePage(page.id)}
                      disabled={!!isBusy || stitching}
                    >
                      {isBusy ? "Generating…" : page.generationPhase === "failed" ? "Retry" : "Generate"}
                    </Button>
                  )}
                  {page.generationPhase === "done" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => generatePage(page.id)}
                      disabled={!!isBusy || stitching}
                    >
                      Regenerate
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}

        {project.pages.length > 0 && (
          <div className="pt-2">
            <Button
              size="lg"
              className="w-full bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white border-0"
              onClick={stitch}
              disabled={!allDone || anyProcessing || stitching || project.status === "generating"}
            >
              {stitching || project.status === "generating"
                ? PRODUCT_TERMS.stitchInProgress
                : project.finalVideoUrl
                  ? PRODUCT_TERMS.stitchAgainButton
                  : allDone
                    ? PRODUCT_TERMS.stitchButton
                    : "Make all the pages first"}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
