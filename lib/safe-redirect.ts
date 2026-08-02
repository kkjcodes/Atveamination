// Shared open-redirect guard for post-auth navigation. Prior implementations
// used `startsWith("/") && !startsWith("//")` which is bypassable via
// backslash-prefixed values like "/\evil.com" — browsers and Next.js router
// normalize the backslash to a forward slash and end up navigating off-site.
//
// Correct approach: parse the raw value against a fake origin, then require:
//   1. url.origin matches the fake origin (i.e. no protocol/host escape)
//   2. the pathname doesn't itself start with `//` or `\\` or `/\`
//      (paranoid — URL() normalizes most of these, but backslashes have
//      inconsistent handling across parsers)
//   3. resolved pathname is inside the allowlist of application paths

const FAKE_ORIGIN = "https://app.local"

// Paths we're willing to redirect to. Anything not on this list falls back
// to /dashboard. Explicit allowlist is stronger than "any relative path" —
// it prevents an attacker from creating a phishing loop like
// /auth/login?redirect=/auth/login&email=... by narrowing to real dests.
const ALLOWED_PATHS = new Set<string>([
  "/dashboard",
  "/business",
  "/business/new",
  "/personal",
  "/scrapbook",
  "/scrapbook/new",
  "/gallery",
])

// Also accept dynamic children under these prefixes so /business/[id],
// /scrapbook/[id], /studio/[id] etc. work after login.
const ALLOWED_PREFIXES = [
  "/business/",
  "/scrapbook/",
  "/studio/",
  "/character/",
  "/voice/",
]

export function safeRedirect(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (!raw) return fallback

  // Reject anything with obvious protocol-escape indicators before URL parsing.
  // Some parsers normalize `\` differently — belt and suspenders.
  if (raw.includes("\\")) return fallback
  if (raw.includes("://")) return fallback

  // Parse against a fake origin. If the raw value starts with a scheme,
  // protocol-relative //, or has escape chars, this will either throw or
  // produce a different origin.
  let parsed: URL
  try {
    parsed = new URL(raw, FAKE_ORIGIN)
  } catch {
    return fallback
  }

  if (parsed.origin !== FAKE_ORIGIN) return fallback

  const path = parsed.pathname
  if (ALLOWED_PATHS.has(path)) return path + parsed.search
  if (ALLOWED_PREFIXES.some((p) => path.startsWith(p))) return path + parsed.search
  return fallback
}
