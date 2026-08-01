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
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      // Verify res.ok — old code fired-and-redirected regardless, so a 403
      // or 500 delete still routed users away and left the row in the DB.
      const res = await fetch(url, { method: "DELETE" }).catch(() => null)
      if (!res || !res.ok) {
        setError("Couldn't delete this. Try again.")
        setLoading(false)
        return
      }
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
      <span className="flex flex-col gap-1">
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
        {error && <span role="alert" className="text-xs text-red-600">{error}</span>}
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
