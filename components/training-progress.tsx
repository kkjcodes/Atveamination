"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

export default function TrainingProgress({ jobId }: { jobId: string | null }) {
  const router = useRouter()
  const [progress, setProgress] = useState(5)
  const [refreshing, setRefreshing] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Slowly advance the fake progress bar (never reaches 100 until done)
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        if (p >= 90) return p
        // Slow down as we approach 90%
        const step = p < 50 ? 1.5 : p < 75 ? 0.8 : 0.3
        return Math.min(p + step, 90)
      })
    }, 8000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  // Poll job status every 30s and reload page when done
  useEffect(() => {
    if (!jobId) return
    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`)
        if (!res.ok) return
        const { job } = await res.json()
        if (job.status === "succeeded" || job.status === "failed") {
          if (intervalRef.current) clearInterval(intervalRef.current)
          router.refresh()
        }
      } catch { /* network blip — keep polling */ }
    }

    const pollInterval = setInterval(poll, 30_000)
    return () => clearInterval(pollInterval)
  }, [jobId, router])

  async function handleRefresh() {
    if (!jobId) { router.refresh(); return }
    setRefreshing(true)
    try {
      await fetch(`/api/jobs/${jobId}`)
    } catch { /* ignore */ }
    router.refresh()
  }

  return (
    <div className="mb-8 rounded-xl bg-violet-50 border border-violet-200 px-5 py-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <p className="font-medium text-violet-800 text-sm">LoRA training in progress</p>
          <p className="mt-0.5 text-violet-600 text-sm">
            This typically takes 5–15 minutes. The page will update automatically.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRefresh}
          disabled={refreshing}
          className="shrink-0 border-violet-300 text-violet-700 hover:bg-violet-100"
        >
          {refreshing ? "Checking…" : "↻ Refresh"}
        </Button>
      </div>
      <Progress value={progress} className="h-2" />
      <p className="mt-1.5 text-xs text-violet-500 text-right">{Math.round(progress)}% estimated</p>
    </div>
  )
}
