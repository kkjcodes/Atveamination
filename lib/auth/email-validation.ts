import { promises as dns } from "dns"

// Signup email validation (2026-08-25 spend-protection policy, roadmap §1a):
// friction-free checks that stop made-up domains and throwaway inboxes
// without asking real users to click anything.
//
// Policy per class of DNS result:
//   - Domain does not exist / has no MX → reject (bot or typo either way).
//   - Disposable-mail domain → reject.
//   - DNS lookup ERROR (timeout, SERVFAIL) → ALLOW and log. Fail-open: a
//     resolver hiccup must never block a real signup.

// Common disposable-email providers. Deliberately a short curated list of the
// high-volume offenders, not an exhaustive mirror of a blocklist repo —
// additions are one-line PRs when abuse shows up in the ledger.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.info", "sharklasers.com",
  "10minutemail.com", "10minutemail.net", "temp-mail.org", "temp-mail.io",
  "tempmail.com", "tempmail.dev", "throwawaymail.com", "trashmail.com",
  "yopmail.com", "yopmail.fr", "maildrop.cc", "getnada.com", "nada.ltd",
  "dispostable.com", "mintemail.com", "mytemp.email", "burnermail.io",
  "spamgourmet.com", "mailnesia.com", "mohmal.com", "fakemail.net",
  "emailondeck.com", "tempr.email", "discard.email", "mailcatch.com",
  "inboxkitten.com", "33mail.com", "anonaddy.me", "tempinbox.com",
  "mail-temp.com", "tmpmail.org", "tmpmail.net", "moakt.com", "tmails.net",
  "disposablemail.com", "crazymailing.com", "spam4.me", "grr.la",
])

export type EmailValidationResult =
  | { ok: true }
  | { ok: false; reason: "disposable" | "no_mx" }

const MX_TIMEOUT_MS = 3000

export async function validateEmailDomain(email: string): Promise<EmailValidationResult> {
  const domain = email.split("@")[1]?.toLowerCase().trim()
  if (!domain) return { ok: false, reason: "no_mx" }

  if (DISPOSABLE_DOMAINS.has(domain)) return { ok: false, reason: "disposable" }

  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("MX_TIMEOUT")), MX_TIMEOUT_MS)),
    ])
    if (!records || records.length === 0) return { ok: false, reason: "no_mx" }
    return { ok: true }
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    // Definitive "this domain can't receive mail" answers → reject.
    if (code === "ENOTFOUND" || code === "ENODATA") return { ok: false, reason: "no_mx" }
    // Resolver trouble (timeout, SERVFAIL, etc) → fail open, log for visibility.
    console.warn(`[email-validation] MX lookup inconclusive for ${domain}: ${(e as Error).message} — allowing`)
    return { ok: true }
  }
}
