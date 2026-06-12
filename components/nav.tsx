"use client"

import Link from "next/link"
import { Fragment } from "react"
import { useSession, signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"

type Crumb = { label: string; href?: string }

export default function Nav({ breadcrumbs }: { breadcrumbs?: Crumb[] }) {
  const { status } = useSession()

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white">
      <nav className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-xl font-black text-violet-600 tracking-tight">
          AtVeAnimation
        </Link>

        <div className="flex items-center gap-3">
          {status === "authenticated" && (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/help">Help</Link>
              </Button>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                Sign Out
              </Button>
            </>
          )}
          {status === "unauthenticated" && (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth/login">Sign In</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/auth/signup">Get Started</Link>
              </Button>
            </>
          )}
        </div>
      </nav>

      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="border-t border-zinc-100 bg-zinc-50 px-6 py-2">
          <div className="mx-auto flex max-w-6xl items-center gap-1.5 text-sm">
            <Link href="/dashboard" className="text-zinc-400 hover:text-violet-600 transition-colors">
              Dashboard
            </Link>
            {breadcrumbs.map((crumb, i) => (
              <Fragment key={i}>
                <span className="text-zinc-300 select-none">/</span>
                {crumb.href ? (
                  <Link href={crumb.href} className="text-zinc-400 hover:text-violet-600 transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="font-medium text-zinc-700">{crumb.label}</span>
                )}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
