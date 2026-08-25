import { BRAND } from "@/config/brand"
import type { MetadataRoute } from "next"

const SITE_URL = BRAND.baseUrl

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  // Sitemap lists ONLY public, canonical, index-worthy marketing pages.
  // Excluded (per L1 finding):
  //   /business/new, /scrapbook, /scrapbook/new — authenticated workspace,
  //     redirect anon users to login (nothing for Google to see).
  //   /auth/signup, /auth/login — transactional, not marketing.
  //   /gallery — public but generated dynamically; add back once we have
  //     stable share slugs worth indexing.
  const pages: { path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/personal", changeFrequency: "weekly", priority: 0.9 },
    { path: "/business", changeFrequency: "weekly", priority: 0.9 },
    { path: "/help", changeFrequency: "monthly", priority: 0.6 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
    { path: "/privacy", changeFrequency: "monthly", priority: 0.3 },
    { path: "/terms", changeFrequency: "monthly", priority: 0.3 },
  ]
  return pages.map(({ path, changeFrequency, priority }) => ({
    url: `${SITE_URL}${path}`,
    lastModified: now,
    changeFrequency,
    priority,
  }))
}
