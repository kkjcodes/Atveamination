import type { Metadata } from "next"
import Link from "next/link"
import Nav from "@/components/nav"
import { HeroVideo } from "@/components/hero-video"
import SiteFooter from "@/components/site-footer"

export const metadata: Metadata = {
  title: "Examples",
  description: "Real videos generated on the platform — personal cartoon videos and business ads, unedited.",
  alternates: { canonical: "/examples" },
}

// Every video on this page is real platform output, not staged marketing
// footage. That's the point of the page — show the product, uncut.
const EXAMPLES = [
  {
    src: "/landing/personal-example-1.mp4",
    poster: "/landing/personal-example-1-poster.jpg",
    title: "Personal cartoon video",
    what: "A multi-scene cartoon video from one uploaded photo — character consistency across scenes, AI script, voice, and music.",
  },
  {
    src: "/landing/personal-example-2.mp4",
    poster: "/landing/personal-example-2-poster.jpg",
    title: "Everyday scene",
    what: "A single-scene clip showing how a character moves through an ordinary setting while keeping the same look.",
  },
  {
    src: "/landing/personal-example-3.mp4",
    poster: "/landing/personal-example-3-poster.jpg",
    title: "Short character clip",
    what: "A quick clip built from one photo and one line of description.",
  },
  {
    src: "/marketing/business-hero.mp4",
    poster: "/marketing/business-hero-poster.jpg",
    title: "Business ad",
    what: "A vertical video ad for a (fictional) real-estate business: AI script, voiceover, music, captions, and end card — generated from photos.",
  },
]

export default function ExamplesPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-4xl px-6 py-14">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">Real output, unedited</h1>
          <p className="mx-auto mt-3 max-w-lg text-zinc-600">
            Everything below was generated on the platform. No touch-ups, no staged footage —
            this is what you get.
          </p>
        </div>
        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {EXAMPLES.map((e) => (
            <figure key={e.src} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <HeroVideo src={e.src} poster={e.poster} label={`Play: ${e.title}`} fit="contain" />
              <figcaption className="p-5">
                <p className="font-semibold text-zinc-900">{e.title}</p>
                <p className="mt-1 text-sm text-zinc-600">{e.what}</p>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link
            href="/try"
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
          >
            See yourself as a cartoon — free, no account
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
