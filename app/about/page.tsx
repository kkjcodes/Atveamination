import type { Metadata } from "next"
import Link from "next/link"
import Nav from "@/components/nav"
import { BRAND } from "@/config/brand"

export const metadata: Metadata = {
  title: "About",
  description: "What this product is, what it isn't, and how to reach us.",
  alternates: { canonical: "/about" },
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-zinc-50">
      <Nav />
      <main className="mx-auto max-w-2xl px-6 py-14">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900">About {BRAND.productName}</h1>
        <div className="mt-6 space-y-4 text-zinc-600">
          <p>
            {BRAND.productName} turns photos into cartoon videos. For families, that means
            videos starring you and the people you love. For small businesses, it means a
            ready-to-post video ad presented by your own cartoon character — openly a cartoon,
            never a fake human pretending to be a customer.
          </p>
          <p>
            The part we care most about is likeness: the cartoon should actually look like the
            person in the photo, in every scene, every time. That&apos;s the hard problem, and
            it&apos;s where most of our engineering goes.
          </p>
          <p>
            What we are not: a stock-footage library, a deepfake tool, or a place where your
            photos train anything other than your own characters. Photos are never sold, never
            used for ads, and deleted within 30 days when you delete your account — the{" "}
            <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link>{" "}
            has the details. {BRAND.productName} is an independent product and is not
            affiliated with any animation studio or the AI providers whose models help power it.
          </p>
          <p>
            Questions, ideas, or something broken? Email{" "}
            <a href={`mailto:${BRAND.supportEmail}`} className="font-medium text-zinc-800 underline underline-offset-2">
              {BRAND.supportEmail}
            </a>{" "}
            — we read every message.
          </p>
        </div>
        <div className="mt-10">
          <Link
            href="/try"
            className="inline-flex items-center justify-center rounded-lg bg-violet-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
          >
            See yourself as a cartoon — free
          </Link>
        </div>
      </main>
    </div>
  )
}
