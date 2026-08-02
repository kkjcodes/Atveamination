"use client"

import { Suspense, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { signIn } from "next-auth/react"
import Nav from "@/components/nav"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { safeRedirect } from "@/lib/safe-redirect"

// Next.js 15 requires useSearchParams() to be wrapped in a Suspense boundary
// so pages using it can still be statically rendered where possible.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  )
}

function LoginPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = safeRedirect(searchParams.get("redirect"))
  // Preserve intent when the user clicks "Sign up free" — otherwise a
  // business visitor who lands on login by mistake gets sent to /dashboard
  // after account creation instead of /business/new.
  const authIntentParams = new URLSearchParams()
  const rawRedirect = searchParams.get("redirect")
  const segment = searchParams.get("segment")
  if (rawRedirect) authIntentParams.set("redirect", rawRedirect)
  if (segment) authIntentParams.set("segment", segment)
  const signUpHref = authIntentParams.toString() ? `/auth/signup?${authIntentParams.toString()}` : "/auth/signup"
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)

    const result = await signIn("credentials", { email, password, redirect: false })

    if (result?.ok) {
      router.push(nextUrl)
    } else {
      setError("We couldn't sign you in with that email and password. Try again, or reset your password.")
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
            <CardTitle>Welcome back</CardTitle>
            <CardDescription>Sign in to pick up where you left off.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <p className="mt-4 text-center text-sm">
              <Link href="/auth/forgot-password" className="text-zinc-400 hover:text-violet-600 transition-colors">
                Forgot your password?
              </Link>
            </p>

            <p className="mt-3 text-center text-sm text-zinc-500">
              Don&apos;t have an account?{" "}
              <Link href={signUpHref} className="font-medium text-violet-600 hover:underline">
                Sign up free
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  )
}
