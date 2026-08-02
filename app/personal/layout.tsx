import type { Metadata } from "next"

// Client-component pages can't export metadata directly. This layout
// carries the per-route SEO overrides for /personal.
// title.template in the root layout appends "· AtVeAnimation" — pass the
// audience-specific string as { absolute: "..." } to bypass the template.
export const metadata: Metadata = {
  title: { absolute: "Cartoon videos starring you — AtVeAnimation" },
  description: "Upload a photo, pick a style, write a scene. Cartoon videos starring you and the people you love. Multi-character videos supported.",
  alternates: { canonical: "/personal" },
  openGraph: {
    title: "Cartoon videos starring you",
    description: "Cartoon videos starring you and the people you love. Free to start.",
    url: "/personal",
    images: ["/og-image.png"],
  },
}

export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return children
}
