import type { Metadata } from "next"
import Link from "next/link"
import Nav from "@/components/nav"
import SiteFooter from "@/components/site-footer"

export const metadata: Metadata = {
  title: "How it works",
  description: "From one photo to a finished cartoon video in four steps: upload, pick a style, describe your video, download.",
  alternates: { canonical: "/how-it-works" },
}

const STEPS = [
  {
    title: "Add a photo",
    body: "One clear photo of a face is enough. We check it, straighten it, and never use it for anything except your videos.",
    img: "/landing/photo-to-character.png",
    alt: "A photo becoming a cartoon character",
  },
  {
    title: "Pick your style",
    body: "We draw the same person in eight styles — Pixar 3D, anime, Ghibli, chibi, comic, sketch, watercolor, claymation. You pick the one that looks most like you.",
    img: "/landing/eight-styles-grid.jpg",
    alt: "Eight cartoon styles generated from one photo",
  },
  {
    title: "Describe your video",
    body: "One line is enough — we write a scene-by-scene script, voice it, and animate your character through it. Or write every scene yourself.",
    img: null,
    alt: "",
  },
  {
    title: "Download and share",
    body: "A finished MP4, sized for phones and social. Yours to post anywhere. Your character is saved, so the next video takes minutes.",
    img: null,
    alt: "",
  },
]

export default function HowItWorksPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">How it works</h1>
          <p className="mx-auto mt-3 max-w-md text-zinc-600">
            One photo in, a finished cartoon video out. Four steps, no editing skills.
          </p>
        </div>
        <ol className="mt-12 space-y-10">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <div className="flex items-baseline gap-3">
                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h2 className="text-lg font-semibold text-zinc-900">{s.title}</h2>
              </div>
              <p className="mt-3 text-sm text-zinc-600">{s.body}</p>
              {s.img && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={s.img} alt={s.alt} loading="lazy" className="mt-4 w-full rounded-xl" />
              )}
            </li>
          ))}
        </ol>
        <p className="mt-8 text-center text-xs text-zinc-500">
          First-time character setup takes about 20–30 minutes (most of it is training your
          personal model). Every video after that starts in minutes. Videos that fail on our
          side don&apos;t count against your daily limit.
        </p>
        <div className="mt-8 text-center">
          <Link
            href="/try"
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
          >
            Try step one now — free
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
