"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export default function RetrainButton({ characterId }: { characterId: string }) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleRetrain() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/characters/${characterId}/train`, { method: "POST" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Training failed to start")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setLoading(false)
    }
  }

  return (
    <div>
      <Button variant="outline" onClick={handleRetrain} disabled={loading}>
        {loading ? "Starting…" : "Retrain"}
      </Button>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
