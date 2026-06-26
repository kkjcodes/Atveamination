"use client"

import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import Nav from "@/components/nav"
import { useState, useRef } from "react"

const styles = [
  { src: "/landing/image0.png", label: "Pixar · Anime · Ghibli · Chibi" },
  { src: "/landing/image1.png", label: "Comic · Sketch · Watercolor · Claymation" },
  { src: "/landing/image2.png", label: "Anime · Pixar · Sketch · Comic" },
]

const steps = [
  { step: "01", emoji: "📸", title: "Upload Your Photo", description: "One clear selfie — our AI builds a personalised cartoon character in minutes. Do it for everyone in your crew." },
  { step: "02", emoji: "🎨", title: "Pick a Style",       description: "Choose from 8 cartoon styles: Pixar 3D, Anime, Ghibli, Chibi, Comic, Sketch, Watercolor, Claymation." },
  { step: "03", emoji: "🎙️", title: "Skip the voice setup", description: "We auto-match a voice to your character — no recording, no setup. Or record 30 seconds of your own voice if you'd rather." },
  { step: "04", emoji: "🎬", title: "Generate & Share",   description: "Pick a preset scene or let AI write the script. Hit generate, get an animated MP4 — share instantly." },
]

const useCases = [
  { emoji: "👨‍👩‍👧‍👦", title: "Family Adventures", desc: "Put the whole family in a cartoon together. Kids go wild when they see mum and dad as Pixar characters." },
  { emoji: "💑",         title: "Couple Moments",   desc: "Surprise your partner with an animated version of your favourite memory. Way better than a meme." },
  { emoji: "🎂",         title: "Birthday Wishes",  desc: "Send a cartoon birthday message starring you — or the whole friend group. Way more memorable than a text." },
  { emoji: "📱",         title: "Viral Social Content", desc: "Animated Reels and TikToks that stop the scroll. Your face, your crew, your story." },
  { emoji: "📚",         title: "Kids' Story Time", desc: "Become a cartoon character in bedtime stories your kids will beg to watch again and again." },
  { emoji: "🎉",         title: "Group Celebrations", desc: "Holidays, graduations, weddings — animate the whole group and share the video in the group chat." },
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

          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-5 py-2 text-sm font-semibold text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            100% Free · No Waitlist · Start in Seconds
          </div>

          <h1 className="mb-4 text-5xl font-black tracking-tight sm:text-7xl leading-tight">
            Cartoon Videos{" "}
            <span className="bg-gradient-to-r from-yellow-300 to-orange-300 bg-clip-text text-transparent">
              Starring You
            </span>
            <br />& Your Whole Crew
          </h1>

          <p className="mx-auto mb-4 max-w-xl text-lg text-violet-200">
            Upload a photo, pick a cartoon style, write a scene — get a fully animated video in minutes.
            Add family, friends, or your partner for videos everyone will want to share.
          </p>

          <div className="mx-auto mb-8 inline-flex flex-wrap justify-center items-center gap-x-3 gap-y-1 rounded-xl border border-yellow-400/30 bg-yellow-400/10 px-5 py-2.5 text-sm font-medium text-yellow-200">
            🎬 <strong className="text-yellow-300">10 free scenes every day.</strong>
            <span className="text-yellow-400/60">·</span>
            <span>8 cartoon styles.</span>
            <span className="text-yellow-400/60">·</span>
            <span>Up to 4 characters per video.</span>
          </div>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Button asChild size="lg" className="bg-white text-violet-700 hover:bg-violet-50 font-bold shadow-lg px-8 text-base">
              <Link href="/auth/signup">Make Your First Cartoon — Free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/30 bg-white/10 text-white hover:bg-white/20 text-base">
              <Link href="/auth/login">Sign In</Link>
            </Button>
          </div>
        </div>

        {/* Hero showcase */}
        <div className="relative mx-auto mt-14 max-w-lg rounded-2xl border border-white/20 bg-white/5 backdrop-blur-sm overflow-hidden shadow-2xl">
          <div className="px-6 py-5 border-b border-white/10 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-300 mb-1">8 Cartoon Styles</p>
            <p className="text-lg font-bold text-white">One Photo. Endless Possibilities.</p>
            <p className="text-sm text-violet-200/80 mt-1">
              Every style below was generated from a single uploaded photo — no design skills needed.
            </p>
          </div>

          <div className="p-4 space-y-3">
            <div className="relative overflow-hidden rounded-xl shadow-lg">
              <Image
                src="/landing/Images.jpeg"
                alt="One photo transformed into eight cartoon styles"
                width={600}
                height={680}
                className="w-full"
                priority
              />
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-4 py-3">
                <p className="text-xs font-medium text-white/80">One photo → 8 cartoon styles</p>
              </div>
            </div>
            <div className="relative overflow-hidden rounded-xl shadow-lg">
              <Image
                src="/landing/Babu.png"
                alt="Your photo transformed into your cartoon character"
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

          <div className="px-6 py-4 border-t border-white/10 text-center">
            <p className="text-xs text-violet-300/70">
              Pixar · Anime · Ghibli · Chibi · Comic · Sketch · Watercolor · Claymation
            </p>
          </div>
        </div>
      </section>

      {/* ── Free tier highlight ───────────────────────────────────────────── */}
      <section className="bg-emerald-50 border-y border-emerald-100 px-6 py-12">
        <div className="mx-auto max-w-4xl">
          <p className="mb-6 text-center text-sm font-semibold uppercase tracking-widest text-emerald-600">Everything you get for free</p>
          <div className="grid gap-4 sm:grid-cols-4">
            {[
              { n: "10", label: "Scenes/day", sub: "Resets at midnight" },
              { n: "20", label: "AI scripts/day", sub: "Claude writes your story" },
              { n: "10", label: "Characters for life", sub: "Train once, use forever" },
              { n: "8",  label: "Cartoon styles", sub: "Pick what you love" },
            ].map(({ n, label, sub }) => (
              <div key={label} className="flex flex-col items-center rounded-2xl bg-white border border-emerald-100 px-5 py-7 shadow-sm text-center">
                <span className="text-4xl font-black text-emerald-500">{n}</span>
                <span className="mt-1 font-semibold text-zinc-800 text-sm">{label}</span>
                <span className="mt-1 text-xs text-zinc-400">{sub}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Multi-character callout ───────────────────────────────────────── */}
      <section className="px-6 py-20 bg-gradient-to-br from-orange-50 to-yellow-50">
        <div className="mx-auto max-w-4xl">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500 mb-3">New · Multi-Character Videos</p>
            <h2 className="text-3xl font-bold text-zinc-900 mb-3">
              Bring your whole crew into the cartoon
            </h2>
            <p className="text-zinc-500 max-w-xl mx-auto">
              Add up to 4 characters per video — family members, your partner, friends.
              Each character speaks in their own voice. The AI writes scenes that feature everyone
              and figures out who's talking. No extra setup, no approval gates.
            </p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            {[
              { emoji: "👨‍👩‍👧", title: "Families", desc: "Mum, dad, and the kids in one animated adventure. Pick a preset scene or let AI write it." },
              { emoji: "💑",     title: "Couples",  desc: "A surprise cartoon for your anniversary, birthday, or just because. They'll love it." },
              { emoji: "🫂",     title: "Friends",  desc: "The whole friend group in a birthday video, a holiday memory, or a totally random adventure." },
            ].map(({ emoji, title, desc }) => (
              <div key={title} className="rounded-2xl bg-white border border-orange-100 p-7 shadow-sm text-center hover:shadow-md transition-shadow">
                <div className="text-4xl mb-3">{emoji}</div>
                <h3 className="font-bold text-zinc-900 mb-2">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="mt-10 text-center">
            <Button asChild size="lg" className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 shadow-lg">
              <Link href="/auth/signup">Make a Family Video — Free</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Video showcase ────────────────────────────────────────────────── */}
      <section className="px-6 py-20 bg-zinc-950">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <h2 className="mb-2 text-3xl font-bold text-white">See it in action</h2>
            <p className="text-zinc-400">Real videos generated on the platform</p>
          </div>

          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/20 border border-violet-500/30 px-3 py-1 text-xs font-semibold text-violet-300 uppercase tracking-wider">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
                Featured
              </span>
            </div>
            <VideoCard src="/landing/atharv_video.mp4" poster="/landing/atharv_poster.jpg" label="Watch" />
          </div>

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
            <h2 className="mb-2 text-3xl font-bold text-zinc-900">8 styles. Your face. Your vibe.</h2>
            <p className="text-zinc-500">Every style generated from a single photo — swap anytime</p>
          </div>

          {/* Style name pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-10">
            {["Pixar 3D", "Anime", "Studio Ghibli", "Chibi", "Comic Book", "Pencil Sketch", "Watercolor", "Claymation"].map((s) => (
              <span key={s} className="rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-sm font-medium text-violet-700">
                {s}
              </span>
            ))}
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

          <div className="mt-10 text-center">
            <Button asChild size="lg" className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-8">
              <Link href="/auth/signup">Try All 8 Styles Free</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── Preset scenes callout ─────────────────────────────────────────── */}
      <section className="bg-violet-50 border-y border-violet-100 px-6 py-16">
        <div className="mx-auto max-w-4xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-3">20 Ready-Made Scenes</p>
          <h2 className="text-2xl font-bold text-zinc-900 mb-3">No script? No problem.</h2>
          <p className="text-zinc-500 max-w-xl mx-auto mb-8">
            Pick from 20 curated scenes — Morning Coffee, City Stroll, Birthday Party, Mountain Summit,
            and more. One tap and the AI generates the video. Or write your own scene from scratch.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {["☕ Morning Coffee", "🎂 Birthday Party", "🏔️ Mountain Summit", "🌊 Underwater Adventure", "🚀 Rocket Launch", "🌅 Beach Sunset", "🎉 New Year", "🤝 Best Friends"].map((tag) => (
              <span key={tag} className="rounded-full bg-white border border-violet-200 px-4 py-1.5 text-sm text-violet-700 font-medium shadow-sm">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="bg-white px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-14 text-center">
            <h2 className="mb-2 text-3xl font-bold text-zinc-900">How it works</h2>
            <p className="text-zinc-500">Photo to finished video in under 10 minutes</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.step} className="rounded-2xl bg-zinc-50 border border-zinc-100 p-6 shadow-sm hover:border-violet-200 hover:bg-violet-50/30 transition-colors">
                <div className="mb-3 text-3xl">{s.emoji}</div>
                <div className="mb-2 text-xs font-bold text-violet-400 tracking-widest">{s.step}</div>
                <h3 className="mb-2 font-bold text-zinc-900">{s.title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Use cases ────────────────────────────────────────────────────── */}
      <section className="px-6 py-20 bg-zinc-50">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-3">For Everyone</p>
            <h2 className="text-3xl font-bold text-zinc-900">What will you make?</h2>
            <p className="mt-2 text-zinc-500">Solo videos, family adventures, couple moments — it all works.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {useCases.map(({ emoji, title, desc }) => (
              <div key={title} className="rounded-2xl border border-zinc-200 bg-white p-6 hover:border-violet-200 hover:shadow-md transition-all">
                <div className="text-3xl mb-3">{emoji}</div>
                <h3 className="font-bold text-zinc-900 mb-1">{title}</h3>
                <p className="text-sm text-zinc-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 text-center">
            <Button asChild size="lg" className="bg-violet-600 hover:bg-violet-700 text-white font-bold px-8">
              <Link href="/auth/signup">Start Free — Make Something Fun</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ── You-asked-we-shipped + contact ───────────────────────────────── */}
      <section className="px-6 py-16 bg-white border-y border-zinc-100">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-violet-500 mb-3">You Asked, We Shipped</p>
          <h2 className="text-2xl font-bold text-zinc-900 mb-3">Built around your feedback</h2>
          <p className="text-zinc-500 leading-relaxed max-w-xl mx-auto mb-8">
            Most of what&apos;s here came from someone emailing in and asking for it. A few of the recent ones:
          </p>

          <div className="grid gap-4 sm:grid-cols-3 mb-8 text-left">
            {[
              {
                ask: "Can I put the whole family in one video?",
                ship: "Multi-character videos — up to 4 people in one cartoon.",
              },
              {
                ask: "Why does everyone sound the same?",
                ship: "Each character now speaks in their own voice, auto-matched to their look.",
              },
              {
                ask: "Audio cuts off at the end of every scene.",
                ship: "Audio-aware video trimming — no more dead silence in the final cut.",
              },
            ].map(({ ask, ship }) => (
              <div key={ask} className="rounded-xl bg-violet-50 border border-violet-100 p-5">
                <p className="text-xs font-semibold text-violet-500 uppercase tracking-wide mb-2">You said</p>
                <p className="text-sm text-zinc-700 italic mb-3">&ldquo;{ask}&rdquo;</p>
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">We shipped</p>
                <p className="text-sm text-zinc-700 leading-snug">{ship}</p>
              </div>
            ))}
          </div>

          <p className="text-zinc-500 leading-relaxed max-w-xl mx-auto">
            Longer videos, more cartoon styles, and episodic content are next on the list.
            If there&apos;s something you&apos;d love to see, tell us.
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
          <p className="mt-3 text-xs text-zinc-400">We read every email.</p>
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
          <p className="mb-2 text-violet-200 text-lg">
            Just your face, a story to tell, and whoever you want in it.
          </p>
          <p className="mb-8 text-violet-300/70 text-sm">
            Solo, with your partner, with the whole family — it all works.
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
