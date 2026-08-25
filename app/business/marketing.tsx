import Link from "next/link"
import Nav from "@/components/nav"
import { HeroVideo } from "@/components/hero-video"
import { BRAND } from "@/config/brand"

// Public /business marketing content. Rendered by app/business/page.tsx
// when the visitor is anonymous. Signed-in users see the workspace instead.
//
// Copy stays strictly business-oriented: no cartoon/character/family
// language, no character-training time (which doesn't apply here — business
// ads use product photos directly, no LoRA).
export default function BusinessMarketing() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Nav />

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="px-6 pt-16 pb-14">
        <div className="mx-auto max-w-5xl grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600 mb-3">
              For your business
            </p>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight leading-tight text-zinc-900">
              Give your business a mascot. It presents every ad you make.
            </h1>
            <p className="mt-5 text-lg text-zinc-600 max-w-lg">
              One selfie becomes your store&apos;s cartoon mascot — openly a
              cartoon, honestly animated, recognizably you. It opens the ad and
              speaks the script with voice, music, and captions, sized for
              social media. No filming, no editing, no fake humans pretending
              to be customers.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/auth/signup?redirect=/business/new&segment=business"
                className="inline-flex items-center justify-center rounded-lg bg-orange-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-700 transition-colors"
              >
                Make an ad from my photos
              </Link>
              <Link
                href="/auth/login?redirect=/business"
                className="text-sm font-medium text-orange-700 hover:text-orange-900"
              >
                Already have an account? Sign in →
              </Link>
            </div>
          </div>
          <div className="mx-auto max-w-[280px] rounded-2xl overflow-hidden shadow-2xl">
            <HeroVideo
              src="/marketing/business-hero.mp4"
              poster="/marketing/business-hero-poster.jpg"
              label="Play example ad"
              aspectClass="aspect-[9/16]"
            />
          </div>
        </div>
      </section>

      {/* ── How it works ──────────────────────────────────────────────────── */}
      <section className="bg-zinc-50 border-y border-zinc-200 px-6 py-16">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-zinc-900 mb-2">
            Three steps to a finished ad
          </h2>
          <p className="text-center text-zinc-500 mb-10">
            Most ads are ready to download in a few minutes.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Add your business details",
                desc: "Name, one-line pitch, and a note about what you sell. Takes a minute.",
              },
              {
                step: "02",
                title: "Upload a few photos",
                desc: "Photos of your product, your storefront, or your work. Three to eight is a good start.",
              },
              {
                step: "03",
                title: "Review and render",
                desc: "Pick a template and voice. We write the script and render an MP4 sized for reels or feeds.",
              },
            ].map(({ step, title, desc }) => (
              <div key={step} className="rounded-xl bg-white border border-zinc-200 p-6 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-widest text-orange-500 mb-2">
                  Step {step}
                </p>
                <h3 className="text-lg font-semibold text-zinc-900 mb-2">{title}</h3>
                <p className="text-sm text-zinc-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What's included ───────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-2 text-center">
            What&apos;s in the ad
          </h2>
          <p className="text-zinc-500 text-center mb-10">
            Every ad ships with these. No add-ons, no upsells.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { title: "Your own mascot", desc: "A cartoon character made from your selfie presents the ad — and fronts every ad you make after it." },
              { title: "AI-written script", desc: "We write a scene-by-scene script tuned to your business and photos." },
              { title: "Voice-over", desc: "Pick from four preset voices — deep, warm, energetic, or calm." },
              { title: "Background music", desc: "Auto-picked from a licensed library that fits your template." },
              { title: "Sized for social", desc: "Choose 9:16 for reels, 1:1 for feeds, or 16:9 for landscape." },
              { title: "Text overlays", desc: "On-brand titles, prices, or calls-to-action baked into the video." },
              { title: "Downloadable MP4", desc: "Yours to post on Instagram, TikTok, Facebook, or wherever." },
            ].map(({ title, desc }) => (
              <div key={title} className="rounded-lg border border-zinc-200 p-4">
                <p className="text-sm font-semibold text-zinc-900">{title}</p>
                <p className="mt-1 text-sm text-zinc-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Who it's for ──────────────────────────────────────────────────── */}
      <section className="bg-orange-50 border-y border-orange-100 px-6 py-16">
        <div className="mx-auto max-w-4xl">
          <h2 className="text-center text-2xl sm:text-3xl font-bold text-zinc-900 mb-2">
            Built for small businesses that don&apos;t have a video team
          </h2>
          <p className="text-center text-zinc-600 mb-10 max-w-2xl mx-auto">
            You have photos of your work. You need a video ad. You don&apos;t
            want to learn video editing or pay $500 for a freelancer.
          </p>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { emoji: "🏘️", label: "Real estate", desc: "Listing walkthroughs, open house teasers." },
              { emoji: "🥖", label: "Bakeries & cafés", desc: "New seasonal menu, storefront reels." },
              { emoji: "💇", label: "Salons & spas", desc: "Before/after transformations, promo weeks." },
              { emoji: "🔨", label: "Trades & services", desc: "Before/after project reels, seasonal offers." },
              { emoji: "🛍️", label: "Boutiques", desc: "New arrivals, sales, lookbook loops." },
              { emoji: "🍽️", label: "Restaurants", desc: "Weekly special promos, happy hour teasers." },
            ].map(({ emoji, label, desc }) => (
              <div key={label} className="rounded-lg bg-white border border-orange-200 p-4">
                <p className="text-2xl mb-1">{emoji}</p>
                <p className="text-sm font-semibold text-zinc-900">{label}</p>
                <p className="mt-1 text-xs text-zinc-500">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing note ──────────────────────────────────────────────────── */}
      <section className="px-6 py-16 bg-white">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-zinc-900 mb-3">
            Free while we&apos;re in early access
          </h2>
          <p className="text-zinc-600">
            You can make and download videos at no cost while we&apos;re
            still opening the business door. When paid plans launch you&apos;ll
            get a heads-up first, and everything you&apos;ve made stays yours.
          </p>
        </div>
      </section>

      {/* ── Final CTA ─────────────────────────────────────────────────────── */}
      <section className="bg-gradient-to-br from-orange-600 to-amber-600 px-6 py-20 text-center text-white">
        <div className="mx-auto max-w-xl">
          <h2 className="mb-4 text-3xl sm:text-4xl font-black leading-tight">
            Make your first ad today.
          </h2>
          <p className="mb-8 text-orange-100 text-lg">
            Free to try. No card, no filming, no editing.
          </p>
          <Link
            href="/auth/signup?redirect=/business/new&segment=business"
            className="inline-flex items-center justify-center rounded-lg bg-white px-8 py-3 text-base font-bold text-orange-700 shadow-xl hover:bg-orange-50 transition-colors"
          >
            Make an ad from my photos
          </Link>
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
