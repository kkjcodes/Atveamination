"use client"

import { useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

function ResetForm() {
  const searchParams        = useSearchParams()
  const router              = useRouter()
  const token               = searchParams.get("token") ?? ""
  const [password, setPassword]         = useState("")
  const [confirm, setConfirm]           = useState("")
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState("")
  const [done, setDone]                 = useState(false)

  if (!token) {
    return (
      <p className="text-sm text-red-600">
        Invalid reset link. <Link href="/auth/forgot-password" className="text-violet-600 hover:underline">Request a new one.</Link>
      </p>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")

    if (password !== confirm) {
      setError("Passwords do not match")
      return
    }

    setLoading(true)
    const res = await fetch("/api/auth/reset-password", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ token, password }),
    })
    setLoading(false)

    if (res.ok) {
      setDone(true)
      setTimeout(() => router.push("/auth/login"), 2000)
    } else {
      const { error: msg } = await res.json()
      setError(msg ?? "Something went wrong")
    }
  }

  if (done) {
    return (
      <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
        Password updated. Redirecting to sign in…
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          placeholder="At least 8 characters"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm password</Label>
        <Input
          id="confirm"
          type="password"
          placeholder="Repeat password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Saving…" : "Set new password"}
      </Button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <div className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Set new password</CardTitle>
            <CardDescription>Choose a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={<p className="text-sm text-zinc-400">Loading…</p>}>
              <ResetForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
