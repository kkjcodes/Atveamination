"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import Nav from "@/components/nav"
import { useState, useRef } from "react"

const styles = [
  { src: "/landing/image0.png", label: "Comic · Pixar · Anime · Sketch" },
  { src: "/landing/image1.png", label: "Pixar · Anime · Sketch · Comic" },
  { src: "/landing/image2.png", label: "Anime · Pixar · Sketch · Comic" },
]

const steps = [
  { step: "01", title: "Upload Your Photo", description: "One clear selfie. Our AI builds a personalised cartoon model of you in minutes." },
  { step: "02", title: "Pick a Style",       description: "Pixar 3D, Anime, Comic Book, Pencil Sketch — preview all four before you choose." },
  { step: "03", title: "Clone Your Voice",   description: "Record 30 seconds of speech. Your cartoon narrates in your actual voice." },
  { step: "04", title: "Generate & Share",   description: "Write your scenes, hit generate, get a fully animated MP4 — ready to share." },
]

function VideoCard({ src, label, poster }: { src: string; label: string; poster: string }) {
  const [playing, setPlaying] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  function handlePlay() {
    setPlaying(true)
    videoRef.current?.play()
  }

  return (
    <div className="group relative overflow-hidden rounded-2xl bg-zinc-900 shadow-2xl">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        className="w-full aspect-video object-cover"
        playsInline
        preload="none"
        controls={playing}
        onEnded={() => setPlaying(false)}
      />
      {!playing && (
        <button
          onClick={handlePlay}
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/40 transition hover:bg-black/30"
        >
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-lg transition group-hover:scale-110">
            <svg className="ml-1 h-7 w-7 text-violet-700" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-white drop-shadow">{label}</span>
        </button>
      )}
    </div>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Nav />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-950 via-violet-800 to-purple-700 px-6 pb-24 pt-20 text-center text-white">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-violet-500/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-3xl">

          {/* Free badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-5 py-2 text-sm font-semibold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            100% Free · No credit card · No waitlist
          </div>

          <h1 className="mb-4 text-5xl font-black tracking-tight sm:text-7xl leading-tight">
            Your Personal AI Cartoon Studio,{" "}
            <span className="bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
              Starring You
            </span>
          </h1>

          <p className="mx-auto mb-4 max-w-xl text-lg text-violet-200">
            Upload one photo, clone your voice, write a scene — get a fully animated,
            narrated cartoon video. No editing skills required.
          </p>

          {/* Free scenes callout */}
          <div className="mx-auto mb-8 inline-flex items-center gap-2 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-5 py-2.5 text-sm font-medium text-yellow-200">
            🎬 <strong className="text-yellow-300">10 free scenes every day.</strong>&nbsp;20 AI scripts. 3 characters for life.
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="bg-white text-violet-700 hover:bg-violet-50 font-bold shadow-lg px-8 text-base">
              <Link href="/auth/signup">Start Free — No Card Needed</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 text-base">
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
        </div>

        {/* Hero showcase — framed sample card */}
        <div className="relative mx-auto mt-14 max-w-lg rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl">
          {/* Card header */}
          <div className="px-6 py-5 border-b border-white/10 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-300 mb-1">4 Cartoon Styles</p>
            <p className="text-lg font-bold text-white">See What&apos;s Possible</p>
            <p className="text-sm text-violet-200/80 mt-1">
              Every style below was generated from a single uploaded photo — no design skills needed.
            </p>
          </div>

          {/* Images */}
          <div className="p-4 space-y-3">
            <div className="relative overflow-hidden rounded-xl shadow-lg">
              <Image
                src="/landing/Images.jpeg"
                alt="One photo transformed into four cartoon styles"
                width={600}
                height={680}
                className="w-full"
                priority
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                <p className="text-xs font-medium text-white/80">One photo → 4 cartoon styles</p>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl shadow-lg">
              <Image
                src="/landing/Babu.png"
                alt="Another photo transformed into cartoon styles"
                width={720}
                height={540}
                className="w-full object-cover"
                priority
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                <p className="text-xs font-medium text-white/80">Your photo → your character</p>
              </div>
            </div>
          </div>

          {/* Card footer CTA */}
          <div className="px-6 py-4 border-t border-white/10 text-center">
            <p className="text-xs text-violet-300/70">
              Pixar 3D · Anime · Comic Book · Pencil Sketch — pick the style that fits your story
            </p>
          </div>
        </div>
      </section>

      {/* ── Free tier highlight ───────────────────────────────────────────── */}
      <section className="bg-emerald-50 border-y border-emerald-100 px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <p className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-emerald-600">What you get for free, every day</p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { n: "10", label: "Scenes generated", sub: "Resets at midnight UTC" },
              { n: "20", label: "AI scripts written", sub: "Claude writes your story" },
              { n: "3",  label: "Characters for life", sub: "Train your cartoon once, use forever" },
            ].map(({ n, label, sub }) => (
              <div key={n} className="flex flex-col items-center rounded-2xl bg-white border border-emerald-100 px-6 py-8 shadow-sm text-center">
                <span className="text-5xl font-black text-emerald-500">{n}</span>
                <span className="mt-1 font-semibold text-zinc-800">{label}</span>
                <span className="mt-1 text-xs text-zinc-400">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Video showcase ────────────────────────────────────────────────── */}
      <section className="px-6 py-20 bg-zinc-950">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-2 text-3xl font-bold text-white">See it in action</h2>
            <p className="text-zinc-400">Real videos generated by the platform</p>
          </div>

          {/* Featured video */}
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/20 border border-violet-500/30 px-3 py-1 text-xs font-semibold text-violet-300 uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                Featured
              </span>
            </div>
            <VideoCard src="/landing/atharv_video.mp4" poster="/landing/atharv_poster.jpg" label="Watch" />
          </div>

          {/* Secondary clips */}
          <div className="grid gap-6 sm:grid-cols-2">
            <VideoCard src="/landing/shop.mp4"  poster="/landing/shop_poster.jpg"  label="Watch clip" />
            <VideoCard src="/landing/video.mp4" poster="/landing/video_poster.jpg" label="Watch clip" />
          </div>
        </div>
      </section>

      {/* ── Style gallery ─────────────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-2 text-3xl font-bold text-zinc-900">Four styles. Your face. Instant.</h2>
            <p className="text-zinc-500">Every style is generated from a single uploaded photo</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {styles.map(({ src, label }) => (
              <div key={src} className="group overflow-hidden rounded-2xl border border-zinc-100 shadow-md hover:shadow-xl transition-shadow">
                <Image
                  src={src}
                  alt={label}
                  width={480}
                  height={480}
                  className="w-full object-cover transition-transform group-hover:scale-[1.02]"
                />
                <div className="px-4 py-3 bg-white">
                  <p className="text-xs text-zinc-400 font-medium">{label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="bg-violet-50 px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center">
            <h2 className="mb-2 text-3xl font-bold text-zinc-900">How it works</h2>
            <p className="text-zinc-500">Four steps from photo to finished video</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.step} className="rounded-2xl bg-white border border-violet-100 p-6 shadow-sm">
                <div className="mb-4 text-4xl font-black text-violet-100">{s.step}</div>
                <h3 className="mb-2 font-semibold text-zinc-900">{s.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Roadmap + contact ─────────────────────────────────────────────── */}
      <section className="px-6 py-16 bg-white border-y border-zinc-100">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-3">Always Improving</p>
          <h2 className="text-2xl font-bold text-zinc-900 mb-3">
            This is just the beginning
          </h2>
          <p className="text-zinc-500 leading-relaxed max-w-xl mx-auto">
            We ship new features regularly — lip sync, longer videos, episodic content, and more are all on the roadmap.
            If there&apos;s something you&apos;d love to see, we want to hear about it.
          </p>
          <a
            href="mailto:contact@atveanimation.com"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-medium text-violet-700 hover:bg-violet-100 transition-colors"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            contact@atveanimation.com
          </a>
          <p className="mt-3 text-xs text-zinc-400">Feature requests, feedback, or just to say hello — we read every email.</p>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-violet-900 to-purple-800 px-6 py-24 text-center text-white">
        <div className="mx-auto max-w-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/20 px-4 py-1.5 text-sm font-medium text-violet-200">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Free to start. Always.
          </div>
          <h2 className="mb-4 text-4xl font-black leading-tight">
            Your cartoon video is<br />10 minutes away.
          </h2>
          <p className="mb-8 text-violet-200">
            No studio. No editing skills. No credit card.
            Just your face, your voice, and a story to tell.
          </p>
          <Button asChild size="lg" className="bg-white text-violet-700 hover:bg-violet-50 font-bold px-10 text-base shadow-xl">
            <Link href="/auth/signup">Create Your First Video — Free</Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-zinc-200 px-6 py-8 text-center text-sm text-zinc-400">
        <p>© {new Date().getFullYear()} AtVeAnimation. All rights reserved.</p>
        <p className="mt-2 flex items-center justify-center gap-4">
          <Link href="/privacy" className="hover:text-zinc-600 transition-colors">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-zinc-600 transition-colors">Terms of Use</Link>
        </p>
      </footer>
    </div>
  )
}
