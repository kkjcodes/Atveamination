"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

export default function DeleteButton({
  url,
  redirectTo,
  className,
}: {
  url: string
  redirectTo?: string
  className?: string
}) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await fetch(url, { method: "DELETE" })
      if (redirectTo) {
        router.push(redirectTo)
      } else {
        router.refresh()
      }
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1">
        <Button
          size="sm"
          variant="destructive"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? "Deleting…" : "Confirm"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirming(false)}
          disabled={loading}
        >
          Cancel
        </Button>
      </span>
    )
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      className={className ?? "text-zinc-400 hover:text-red-500 hover:bg-red-50"}
      onClick={(e) => { e.stopPropagation(); setConfirming(true) }}
    >
      Delete
    </Button>
  )
}
