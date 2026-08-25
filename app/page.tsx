import Link from "next/link"
import type { Metadata } from "next"
import Nav from "@/components/nav"
import { HeroVideo } from "@/components/hero-video"
import { BRAND } from "@/config/brand"

// Root landing = compact two-audience hub. Both segments (personal + business)
// need a distinct pitch, timing, and proof — a shared page always defaulted
// to one audience and undermined conversion for the other. Consumer copy
// moved to /personal; business copy renders at /business for anonymous
// visitors (auth-aware; see app/business/page.tsx).

export const metadata: Metadata = {
  title: { absolute: `${BRAND.productName} — Turn photos into videos worth sharing` },
  description: "Two ways to make videos from your photos: cartoon videos for personal use, ready-to-post ads for your business.",
  alternates: { canonical: "/" },
  openGraph: {
    title: `${BRAND.productName} — Turn photos into videos worth sharing`,
    description: "Cartoon videos for personal use. Ready-to-post video ads for your business.",
    url: "/",
    images: ["/og-image.png"],
  },
}

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Nav />

      {/* ── Brand headline ────────────────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-8 text-center">
        <div className="mx-auto max-w-2xl">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-zinc-900">
            Turn photos into videos worth sharing.
          </h1>
          <p className="mt-4 text-lg text-zinc-500">
            Two ways to use {BRAND.productName}. Pick whichever fits your day.
          </p>
        </div>
      </section>

      {/* ── Two-audience hub ──────────────────────────────────────────────── */}
      <section className="px-6 pb-20">
        <div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-2">
          {/* Personal card */}
          <div className="group flex flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm transition-shadow hover:shadow-lg">
            {/* Placeholder — hero video pulled 2026-08-02, will restore later tonight */}
            <div className="aspect-video bg-gradient-to-br from-violet-100 via-violet-50 to-purple-50 flex items-center justify-center">
              <div className="text-center px-6">
                <div className="text-4xl mb-3">🎬</div>
                <p className="text-sm font-medium text-violet-700">Example video coming back soon</p>
              </div>
            </div>
            <div className="flex flex-1 flex-col p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-violet-500 mb-2">
                For yourself and family
              </p>
              <h2 className="text-2xl font-bold text-zinc-900">
                Cartoon videos starring you and the people you love.
              </h2>
              <p className="mt-3 text-zinc-600 flex-1">
                Upload a photo, pick a style, write a scene. Share a video
                back to the family chat. Multi-character videos so the whole
                family can be in one.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/personal"
                  className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-violet-700 transition-colors"
                >
                  See how it works
                </Link>
                <Link
                  href="/auth/signup?redirect=/dashboard&segment=personal"
                  className="text-sm font-medium text-violet-700 hover:text-violet-900"
                >
                  Start free →
                </Link>
              </div>
            </div>
          </div>

          {/* Business card */}
          <div className="group flex flex-col overflow-hidden rounded-2xl border border-orange-200 bg-white shadow-sm transition-shadow hover:shadow-lg">
            <HeroVideo
              src="/marketing/business-hero.mp4"
              poster="/marketing/business-hero-poster.jpg"
              label="Play business example"
              fit="contain"
            />
            <div className="flex flex-1 flex-col p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-2 flex items-center gap-2">
                For your business
                <span className="rounded-full bg-orange-600 px-2 py-0.5 text-[10px] font-bold text-white normal-case tracking-normal">NEW</span>
              </p>
              <h2 className="text-2xl font-bold text-zinc-900">
                Your cartoon self presents your business ad.
              </h2>
              <p className="mt-3 text-zinc-600 flex-1">
                Upload photos and a selfie. Your own cartoon character opens
                the ad and speaks the script — with voice, music, captions,
                and a scannable QR code. No filming, no editing, no actors.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <Link
                  href="/business"
                  className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-700 transition-colors"
                >
                  See how it works
                </Link>
                <Link
                  href="/auth/signup?redirect=/business/new&segment=business"
                  className="text-sm font-medium text-orange-700 hover:text-orange-900"
                >
                  Make an ad from my photos →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Shared trust band ─────────────────────────────────────────────── */}
      <section className="border-y border-zinc-200 bg-zinc-50 px-6 py-10">
        <div className="mx-auto max-w-4xl grid gap-4 text-center sm:grid-cols-3">
          <div>
            <p className="text-sm font-semibold text-zinc-800">Downloadable MP4</p>
            <p className="mt-1 text-xs text-zinc-500">Yours to post anywhere.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-800">No filming or editing</p>
            <p className="mt-1 text-xs text-zinc-500">We write, voice, and render for you.</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-zinc-800">Your work is saved</p>
            <p className="mt-1 text-xs text-zinc-500">Come back and pick up where you left off.</p>
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-zinc-200 px-6 py-8 text-center text-sm text-zinc-400">
        <p>© {new Date().getFullYear()} {BRAND.productName}. All rights reserved.</p>
        <p className="mt-2 flex items-center justify-center gap-4">
          <Link href="/privacy" className="hover:text-zinc-600 transition-colors">Privacy</Link>
          <Link href="/terms" className="hover:text-zinc-600 transition-colors">Terms</Link>
          <Link href="/contact" className="hover:text-zinc-600 transition-colors">Contact</Link>
        </p>
      </footer>
    </div>
  )
}
