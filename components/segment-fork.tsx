"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"

// Two-doors fork at the top of the landing page. One click routes the user
// to the flow they picked AND persists that choice on their User row (if
// logged in) so we know which door was crossed. Anonymous visitors don't
// need to be authenticated for this to work — segment gets persisted at
// signup time via a follow-up call.
//
// Design intent (per doc §6): two rooms that feel visually different from
// hover state alone. Family = warm/soft (existing brand). Business =
// craft-and-workshop, not corporate SaaS.
export default function SegmentFork() {
  const router = useRouter()

  async function pick(segment: "family" | "business", href: string) {
    // Fire-and-forget: UI navigates even if the persist call is slow. If the
    // request fails (offline, etc.) the user still gets to the right room.
    void fetch("/api/segment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segment }),
    }).catch(() => {})

    if (href.startsWith("#")) {
      // In-page anchor scroll — router.push mishandles hashes in App Router.
      document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth" })
      return
    }
    router.push(href)
  }

  return (
    <section className="py-16 px-6 bg-gradient-to-b from-white to-zinc-50">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl sm:text-5xl font-black text-zinc-900 tracking-tight">
            Come in. What&apos;s the plan today?
          </h1>
          <p className="mt-3 text-lg text-zinc-500">One place for family videos. One for your next ad. Take your pick.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Family door — warm violet + rose */}
          <button
            type="button"
            onClick={() => pick("family", "#family-landing")}
            className="group relative text-left rounded-2xl p-8 bg-gradient-to-br from-violet-50 to-rose-50 border-2 border-transparent hover:border-violet-300 transition-all overflow-hidden"
          >
            <div className="relative z-10">
              <p className="text-xs font-bold uppercase tracking-widest text-violet-600 mb-2">For you and your people</p>
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">Turn your photos into cartoon videos your kids will replay</h2>
              <p className="text-sm text-zinc-600 mb-6 leading-relaxed">
                Upload one photo of everyone in the video. Pick a cartoon style. Come back after your next coffee. Your video will be ready, and it&apos;s yours to keep.
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-violet-700 group-hover:gap-2 transition-all">
                Start with a photo <span aria-hidden="true">→</span>
              </span>
            </div>
            <div className="absolute -bottom-6 -right-6 text-8xl opacity-10 group-hover:opacity-20 transition-opacity">
              🎬
            </div>
          </button>

          {/* Business door — warm cream + burnt sienna (harmonizes with family door) */}
          <button
            type="button"
            onClick={() => pick("business", "/business")}
            className="group relative text-left rounded-2xl p-8 bg-gradient-to-br from-amber-50 to-orange-100 border-2 border-transparent hover:border-orange-400 transition-all overflow-hidden"
          >
            <div className="relative z-10">
              <p className="text-xs font-bold uppercase tracking-widest text-orange-700 mb-2">For your business</p>
              <h2 className="text-2xl font-bold text-zinc-900 mb-2">A ready-to-post video ad, made from your photos</h2>
              <p className="text-sm text-zinc-700 mb-6 leading-relaxed">
                Upload a few photos of your work. Tell us what you offer. We write the script, add a voice and music, and hand you a video ready to post. Yours to keep.
              </p>
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-800 group-hover:gap-2 transition-all">
                Show me <span aria-hidden="true">→</span>
              </span>
            </div>
            <div className="absolute -bottom-6 -right-6 text-8xl opacity-10 group-hover:opacity-20 transition-opacity">
              📽️
            </div>
          </button>
        </div>

        <div className="text-center mt-8">
          <Link href="/auth/login" className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors">
            Already have an account? Sign in
          </Link>
        </div>
      </div>
    </section>
  )
}
