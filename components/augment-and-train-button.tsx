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
      // Kick off augmentation. Returns 202 immediately; server runs the 35
      // Kontext Pro calls in the background. We poll character.augment_status
      // until it flips to "succeeded" or "failed".
      const augRes = await fetch(`/api/characters/${characterId}/augment`, { method: "POST" })
      if (!augRes.ok) {
        const d = await augRes.json().catch(() => ({}))
        throw new Error(d.error ?? "Augmentation failed to start")
      }

      // Poll every 5s, up to 12 min. 35 images typically take 2-5 min.
      const deadline = Date.now() + 12 * 60 * 1000
      let augStatus: string | null = "processing"
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 5000))
        const s = await fetch(`/api/characters/${characterId}`)
        if (!s.ok) continue
        const d = await s.json()
        augStatus = d.character?.augment_status ?? null
        if (augStatus === "succeeded" || augStatus === "failed") break
      }
      if (augStatus !== "succeeded") {
        throw new Error(augStatus === "failed" ? "Augmentation failed. Please try again." : "Augmentation timed out. Please try again.")
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

  // Copy uses generic time ranges (per review): avoid implementation counts
  // like "20 images" or "4k steps" that lie or drift when we tune batch sizes.
  const label =
    phase === "augmenting" ? "Preparing training images…" :
    phase === "training"   ? "Starting training…" :
    phase === "done"       ? "Done!" :
    hasAugmentedImages     ? "Regenerate training images and retrain" :
                             "Train this character"

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
        <p className="text-xs text-zinc-400 mt-1.5" aria-live="polite">
          Preparing training images — takes a few minutes. You can leave and return.
        </p>
      )}
      {phase === "training" && (
        <p className="text-xs text-zinc-400 mt-1.5" aria-live="polite">
          Training your character — takes 15 to 30 minutes. You can leave and return.
        </p>
      )}
      {error && <p role="alert" className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  )
}
