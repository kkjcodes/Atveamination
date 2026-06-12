"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function AdminEmailPage() {
  const [to, setTo]           = useState<"all" | "single">("single")
  const [userId, setUserId]   = useState("")
  const [subject, setSubject] = useState("")
  const [body, setBody]       = useState("")
  const [loading, setLoading] = useState(false)
  const [result, setResult]   = useState<{ sent: number; failed: number } | null>(null)
  const [error, setError]     = useState("")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setResult(null)

    if (to === "all" && !confirm(`Send to ALL users? This cannot be undone.`)) return

    setLoading(true)
    const res = await fetch("/api/admin/email", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ to, userId: to === "single" ? userId : undefined, subject, body }),
    })
    setLoading(false)

    if (res.ok) {
      const data = await res.json()
      setResult(data)
      setSubject("")
      setBody("")
      setUserId("")
    } else {
      const { error: msg } = await res.json()
      setError(msg ?? "Failed to send")
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <div className="border-b border-zinc-200 bg-white px-8 py-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Contact Users</h1>
          <p className="text-sm text-zinc-400">Send email to a user or everyone</p>
        </div>
        <Link href="/admin/dashboard" className="text-sm text-violet-600 hover:underline">← Dashboard</Link>
      </div>

      <div className="mx-auto max-w-2xl px-8 py-10">
        <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-zinc-100 bg-white p-8 shadow-sm">

          {/* To */}
          <div>
            <label className="mb-2 block text-sm font-medium text-zinc-700">Send to</label>
            <div className="flex gap-4">
              {(["single", "all"] as const).map((opt) => (
                <label key={opt} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    value={opt}
                    checked={to === opt}
                    onChange={() => setTo(opt)}
                    className="accent-violet-600"
                  />
                  <span className="text-sm text-zinc-700">
                    {opt === "single" ? "Single user" : "All users"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {to === "single" && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-zinc-700">User ID</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="Paste user ID from the Users page"
                required
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              <p className="mt-1 text-xs text-zinc-400">Find the user ID on the <Link href="/admin/users" className="text-violet-500 hover:underline">Users page</Link>.</p>
            </div>
          )}

          {to === "all" && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              This will email every registered user. Use sparingly.
            </div>
          )}

          {/* Subject */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. New feature: lip sync is here"
              required
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>

          {/* Body */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-zinc-700">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your message here…"
              required
              rows={8}
              className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-y"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}

          {result && (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Sent to {result.sent} user{result.sent !== 1 ? "s" : ""}.
              {result.failed > 0 && ` ${result.failed} failed.`}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Sending…" : "Send Email"}
          </Button>
        </form>
      </div>
    </div>
  )
}
