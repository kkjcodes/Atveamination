"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface Props {
  characterId: string
  voiceId: string | null
  disabled?: boolean
}

export default function MakeVideoButton({ characterId, voiceId, disabled }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    if (disabled) return
    setLoading(true)
    try {
      let vid = voiceId
      if (!vid) {
        const res = await fetch(`/api/characters/${characterId}/auto-voice`, { method: "POST" })
        if (res.ok) {
          const data = await res.json()
          vid = data.voiceId ?? null
        }
      }
      router.push(`/studio/new?character=${characterId}${vid ? `&voice=${vid}` : ""}`)
    } catch {
      router.push(`/studio/new?character=${characterId}`)
    }
  }

  return (
    <Button size="lg" disabled={disabled || loading} onClick={handleClick}>
      {loading ? "Setting up…" : "Make Video"}
    </Button>
  )
}
