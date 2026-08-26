// Single source of truth for every user-visible brand string. A rebrand is
// planned: at R-time this file (plus env vars for infra) is the ONLY place
// that should need editing. A guard test (__tests__/unit/brand-literals.test.ts)
// fails the build if brand literals appear anywhere else.
//
// Infra identifiers (blob container name, E2E test email domain, ACR/app
// names) are deliberately NOT here — they don't change at rebrand and live
// in env/deploy config.

export const BRAND = {
  productName: "AtVeAnimation",
  // How the name reads aloud / in prose ("AtVe Animation" with a space).
  productNameSpoken: "AtVe Animation",
  domain: "atveanimation.com",
  baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "https://www.atveanimation.com",
  supportEmail: "contact@atveanimation.com",
  // Transactional email From header.
  emailFrom: "AtVeAnimation <donotreply@atveanimation.com>",
  // Social share text handle.
  shareHandle: "@AtVeAnimation",
  // No standalone logo asset yet — the wordmark is text. Add logo paths here
  // when the rebrand (Phase R) produces real files.
  ogImage: "/og-image.png",
  tagline: "Turn photos into videos worth sharing.",
  socialHandles: {
    github: "https://github.com/kkjcodes",
    devto: "https://dev.to/kkjcodes",
  },
  // Burned into rendered video output (end-card corner credit, share
  // watermark). Changing this affects FUTURE renders only — existing MP4s
  // keep the pixels they were rendered with (see task R8).
  videoCredit: "made with atveanimation.com",
} as const
