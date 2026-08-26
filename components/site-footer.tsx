import Link from "next/link"
import { BRAND } from "@/config/brand"

// The one site footer. Every page renders this — public marketing, legal,
// and app screens alike — so navigation and the support email are always in
// the same place (user-reported: /examples shipped with no footer at all).
export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 px-6 py-8 text-center text-sm text-zinc-400">
      <p>© {new Date().getFullYear()} {BRAND.productName}. All rights reserved.</p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-4">
        <Link href="/examples" className="hover:text-zinc-600 transition-colors">Examples</Link>
        <Link href="/how-it-works" className="hover:text-zinc-600 transition-colors">How it works</Link>
        <Link href="/about" className="hover:text-zinc-600 transition-colors">About</Link>
        <Link href="/privacy" className="hover:text-zinc-600 transition-colors">Privacy</Link>
        <Link href="/terms" className="hover:text-zinc-600 transition-colors">Terms</Link>
        <Link href="/contact" className="hover:text-zinc-600 transition-colors">Contact</Link>
      </p>
      <p className="mt-2 text-xs">
        <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-zinc-600 transition-colors">{BRAND.supportEmail}</a> · We read every email.
      </p>
    </footer>
  )
}
