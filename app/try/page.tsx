import type { Metadata } from "next"
import Nav from "@/components/nav"
import TryWidget from "@/components/try-widget"
import { BRAND } from "@/config/brand"
import SiteFooter from "@/components/site-footer"

export const metadata: Metadata = {
  title: "See yourself as a cartoon",
  description: "Drop one photo and see yourself as a Pixar, anime, comic, or watercolor cartoon — free, no account needed.",
  alternates: { canonical: "/try" },
}

export default function TryPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
            See yourself as a cartoon
          </h1>
          <p className="mx-auto mt-3 max-w-md text-zinc-600">
            One photo, about 15 seconds, no account. If you like what you see,
            the same character can star in a full video.
          </p>
        </div>
        <div className="mt-10">
          <TryWidget />
        </div>
        <div className="mx-auto mt-12 max-w-md rounded-xl border border-zinc-200 bg-white px-5 py-4 text-sm text-zinc-600">
          <p className="font-medium text-zinc-800">Your photos stay yours</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
            <li>Preview photos are deleted within 24 hours</li>
            <li>Never used to train other people&apos;s models</li>
            <li>Never sold, never used for ads</li>
          </ul>
          <p className="mt-2 text-xs text-zinc-400">
            Full details in the <a href="/privacy" className="underline underline-offset-2">privacy policy</a>. Questions? {BRAND.supportEmail}
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
