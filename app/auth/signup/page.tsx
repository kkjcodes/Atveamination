"use client"

import { useEffect, Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { signIn } from "next-auth/react"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { safeRedirect } from "@/lib/safe-redirect"
import { trackEvent } from "@/lib/client/track"

// Next.js 15 requires useSearchParams() to be wrapped in a Suspense boundary.
export default function SignupPage() {
  useEffect(() => { trackEvent("signup_started") }, [])
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  )
}

function SignupPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = safeRedirect(searchParams.get("redirect"))
  // Preserve segment intent across the register call so the User row gets
  // the correct segment stamp. Validation happens server-side.
  const segment = searchParams.get("segment") ?? undefined
  // If the visitor already has an account and clicks "Sign in", carry the
  // same redirect + segment so they don't get bounced to /dashboard.
  const authIntentParams = new URLSearchParams()
  const rawRedirect = searchParams.get("redirect")
  if (rawRedirect) authIntentParams.set("redirect", rawRedirect)
  if (segment) authIntentParams.set("segment", segment)
  const signInHref = authIntentParams.toString() ? `/auth/login?${authIntentParams.toString()}` : "/auth/login"
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [termsAccepted, setTermsAccepted] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, segment }),
    })

    if (res.status === 409) {
      setError("An account already exists with that email. Try signing in instead.")
      setLoading(false)
      return
    }

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? "Something went wrong on our end. Try again in a moment.")
      setLoading(false)
      return
    }

    const result = await signIn("credentials", { email, password, redirect: false })
    if (result?.ok) {
      router.push(nextUrl)
    } else {
      setError("Account created but sign-in failed. Please sign in manually.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <div className="flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Create your account</CardTitle>
            <CardDescription>Free to start. Your video and character are yours to keep.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input
                  id="name"
                  type="text"
                  placeholder="Alex Johnson"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters — pick something you'll remember"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <div className="flex items-start gap-2.5">
                <input
                  id="terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-violet-600 cursor-pointer"
                />
                <label htmlFor="terms" className="text-xs text-zinc-500 leading-relaxed cursor-pointer">
                  I am 18 or older and I agree to the{" "}
                  <Link href="/terms" target="_blank" className="text-violet-600 underline hover:text-violet-700">
                    Terms of Use
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" target="_blank" className="text-violet-600 underline hover:text-violet-700">
                    Privacy Policy
                  </Link>
                  . I understand this service is provided &ldquo;as is&rdquo; with no warranties, and I use it at my own risk.
                </label>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading || !termsAccepted}>
                {loading ? "Creating account…" : "Create my account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-zinc-500">
              Already have an account?{" "}
              <Link href={signInHref} className="font-medium text-violet-600 hover:underline">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}
