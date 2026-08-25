import { BRAND } from "@/config/brand"
import type { MetadataRoute } from "next"

const SITE_URL = BRAND.baseUrl

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/admin/", "/auth/callback/", "/dashboard/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
