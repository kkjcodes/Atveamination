"use client"

import { useState } from "react"
import Nav from "@/components/nav"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

// Contact form. Emails contact@atveanimation.com via /api/contact.
// Deliberately not requiring auth — a prospective business owner should be
// able to reach out without signing up first.

const REASONS = [
  { value: "more_videos", label: "More videos than the free plan" },
  { value: "custom_style", label: "Custom style or brand fit" },
  { value: "not_working",  label: "Something's not working" },
  { value: "other",        label: "Something else" },
] as const

export default function ContactPage() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [reason, setReason] = useState<typeof REASONS[number]["value"]>("other")
  const [message, setMessage] = useState("")
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus("sending")
    setError(null)
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, reason, message }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || "Couldn't send")
      }
      setStatus("sent")
    } catch (e) {
      setStatus("error")
      setError(e instanceof Error ? e.message : "Couldn't send")
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav breadcrumbs={[{ label: "Contact" }]} />
      <div className="mx-auto max-w-xl px-6 py-12">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2">Talk to us</h1>
        <p className="text-zinc-500 mb-8">
          Whether you need more videos than the free plan, a custom style, or you&apos;re stuck on something, send us a note.
        </p>

        {status === "sent" ? (
          <Card>
            <CardContent className="p-6">
              <p className="text-lg font-medium text-zinc-900">Got it.</p>
              <p className="mt-2 text-sm text-zinc-500">We&apos;ll reply within one business day.</p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-6">
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <Label htmlFor="name" className="text-sm font-medium text-zinc-700 mb-1.5 block">Your name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Alex Johnson"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="email" className="text-sm font-medium text-zinc-700 mb-1.5 block">Your email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="reason" className="text-sm font-medium text-zinc-700 mb-1.5 block">What can we help with?</Label>
                  <select
                    id="reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value as typeof reason)}
                    className="w-full rounded-md border border-zinc-200 px-3 py-2 text-sm"
                  >
                    {REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="message" className="text-sm font-medium text-zinc-700 mb-1.5 block">Anything you want us to know?</Label>
                  <Textarea
                    id="message"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us about your business or what you're trying to make…"
                    rows={4}
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
                    We couldn&apos;t send that. Try again, or email contact@atveanimation.com directly.
                  </p>
                )}

                <Button
                  type="submit"
                  size="lg"
                  disabled={status === "sending" || !name || !email}
                  className="w-full bg-gradient-to-r from-orange-600 to-red-700 hover:from-orange-700 hover:to-red-800 text-white border-0"
                >
                  {status === "sending" ? "Sending…" : "Send"}
                </Button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
