import type { MetadataRoute } from "next"

const SITE_URL = "https://www.atveanimation.com"

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()
  const pages: { path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }[] = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/business", changeFrequency: "weekly", priority: 0.9 },
    { path: "/business/new", changeFrequency: "weekly", priority: 0.8 },
    { path: "/scrapbook", changeFrequency: "weekly", priority: 0.9 },
    { path: "/scrapbook/new", changeFrequency: "weekly", priority: 0.8 },
    { path: "/gallery", changeFrequency: "daily", priority: 0.7 },
    { path: "/help", changeFrequency: "monthly", priority: 0.6 },
    { path: "/contact", changeFrequency: "monthly", priority: 0.5 },
    { path: "/auth/signup", changeFrequency: "monthly", priority: 0.6 },
    { path: "/auth/login", changeFrequency: "monthly", priority: 0.4 },
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
