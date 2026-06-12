"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

type Props = {
  characterId: string
  hasAugmentedImages: boolean
}

export default function AugmentAndTrainButton({ characterId, hasAugmentedImages }: Props) {
  const router = useRouter()
  const [phase, setPhase] = useState<"idle" | "augmenting" | "training" | "done">("idle")
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    setPhase("augmenting")
    try {
      const augRes = await fetch(`/api/characters/${characterId}/augment`, { method: "POST" })
      if (!augRes.ok) {
        const d = await augRes.json()
        throw new Error(d.error ?? "Augmentation failed")
      }

      setPhase("training")
      const trainRes = await fetch(`/api/characters/${characterId}/train`, { method: "POST" })
      if (!trainRes.ok) {
        const d = await trainRes.json()
        throw new Error(d.error ?? "Training failed to start")
      }

      setPhase("done")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong")
      setPhase("idle")
    }
  }

  const label =
    phase === "augmenting" ? "Generating 20 training images…" :
    phase === "training"   ? "Starting training…" :
    phase === "done"       ? "Done!" :
    hasAugmentedImages     ? "Re-augment & Retrain (4k steps)" :
                             "Generate Training Data & Train (4k steps)"

  return (
    <div>
      <Button
        onClick={handleClick}
        disabled={phase !== "idle"}
        variant={hasAugmentedImages ? "outline" : "default"}
        size="sm"
      >
        {label}
      </Button>
      {phase === "augmenting" && (
        <p className="text-xs text-zinc-400 mt-1.5">
          Generating 20 pose and expression variants — takes 3–5 min
        </p>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
