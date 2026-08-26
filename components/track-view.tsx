"use client"

import { useEffect } from "react"
import { trackEvent } from "@/lib/client/track"

// Fire-once page-view beacon for funnel pages (D1). Rendered by server
// components that can't call trackEvent themselves.
export default function TrackView({ name, page }: { name: string; page: string }) {
  useEffect(() => {
    trackEvent(name, { page })
  }, [name, page])
  return null
}
