"use client"

import { useState } from "react"

const SHARE_TEXT = "I made this AI cartoon video with @AtVeAnimation!"

export default function ShareButtons({ url, size = "default" }: { url: string; size?: "default" | "sm" }) {
  const [copied, setCopied] = useState(false)
  const heightClass = size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm"

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Clipboard API blocked — fall back to selecting in a hidden input
      const ta = document.createElement("textarea")
      ta.value = url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand("copy")
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(SHARE_TEXT)}&url=${encodeURIComponent(url)}`
  const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${SHARE_TEXT} ${url}`)}`

  const baseBtn = `inline-flex items-center ${heightClass} rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 transition-colors font-medium text-zinc-800`

  return (
    <div className="flex flex-wrap gap-2">
      <button onClick={copy} className={baseBtn} type="button">
        {copied ? "✓ Copied" : "Copy link"}
      </button>
      <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className={baseBtn}>WhatsApp</a>
      <a href={twitterUrl} target="_blank" rel="noopener noreferrer" className={baseBtn}>X / Twitter</a>
      <a href={facebookUrl} target="_blank" rel="noopener noreferrer" className={baseBtn}>Facebook</a>
    </div>
  )
}
