import Link from "next/link"
import type { Metadata } from "next"
import Nav from "@/components/nav"
import { HeroVideo } from "@/components/hero-video"
import TryWidget from "@/components/try-widget"
import { BRAND } from "@/config/brand"
import SiteFooter from "@/components/site-footer"
import TrackView from "@/components/track-view"

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
      <TrackView name="landing_view" page="/" />

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
          {/* Personal card — the live demo IS the hero (task B2): a visitor
              sees their own photo become a cartoon before we ask for anything. */}
          <div className="group flex flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm transition-shadow hover:shadow-lg">
            <div className="border-b border-violet-100 bg-violet-50/40 p-5">
              <TryWidget compact />
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

      {/* ── Style proof strip — real outputs, all from ONE photo ──────────── */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-6xl">
          <p className="text-center text-sm font-semibold text-zinc-800">
            One photo. Eight styles. The same person in every one.
          </p>
          <p className="mt-1 text-center text-xs text-zinc-500">
            Every image below was generated on the platform from a single uploaded photo.
          </p>
          <div className="mt-6 grid grid-cols-4 gap-2 sm:gap-3 md:grid-cols-8">
            {[
              { f: "pixar", label: "Pixar 3D" },
              { f: "anime", label: "Anime" },
              { f: "ghibli", label: "Ghibli" },
              { f: "chibi", label: "Chibi" },
              { f: "comic", label: "Comic" },
              { f: "sketch", label: "Sketch" },
              { f: "watercolor", label: "Watercolor" },
              { f: "claymation", label: "Claymation" },
            ].map((s) => (
              <figure key={s.f}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/marketing/styles/style-${s.f}.jpg`}
                  alt={`The same person rendered in ${s.label} style`}
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
                <figcaption className="mt-1 text-center text-[10px] text-zinc-500">{s.label}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* ── Photo trust block (task C4 — claims mirror the privacy policy) ── */}
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-3xl rounded-2xl border border-zinc-200 bg-zinc-50 px-6 py-6 text-center">
          <p className="text-sm font-semibold text-zinc-800">Your photos stay yours</p>
          <div className="mx-auto mt-3 grid max-w-2xl gap-3 text-xs text-zinc-600 sm:grid-cols-3">
            <p>Never used to train other people&apos;s models</p>
            <p>Deleted within 30 days when you delete your account</p>
            <p>Never sold, never used for advertising</p>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            <Link href="/privacy" className="underline underline-offset-2 hover:text-zinc-600">Read the full privacy policy</Link>
          </p>
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

      <SiteFooter />
    </div>
  )
}
