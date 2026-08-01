"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

// Shown when augmentation succeeded but training never got started (user
// closed the wizard tab between the two steps). Fixes review C1: previously
// the only visible action was AugmentAndTrainButton which would run the 35
// paid Kontext calls again. This uses the existing trainingImages set.
export default function ContinueTrainingButton({ characterId }: { characterId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleClick() {
    setBusy(true)
    setErr(null)
    try {
      const res = await fetch(`/api/characters/${characterId}/train`, { method: "POST" })
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error ?? "Couldn't start training.")
      }
      router.refresh()
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start training.")
      setBusy(false)
    }
  }

  return (
    <div>
      <Button onClick={handleClick} disabled={busy} size="sm">
        {busy ? "Starting training…" : "Continue training"}
      </Button>
      {err && <p className="mt-2 text-xs text-red-600" role="alert">{err}</p>}
    </div>
  )
}
