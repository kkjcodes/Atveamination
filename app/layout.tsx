import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import { AuthProvider } from "@/components/session-provider";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

const SITE_URL = "https://www.atveanimation.com";
const SITE_NAME = "AtVeAnimation";
const SITE_DESCRIPTION = "Turn your photo into a cartoon character and create personalised animated videos with AI. Cartoon videos, business ads, and photo-to-video scrapbooks in minutes.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "AtVeAnimation — AI Cartoon Video Generator",
    template: "%s · AtVeAnimation",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "AI cartoon video",
    "photo to cartoon",
    "AI video generator",
    "personalised animated video",
    "AI ad generator",
    "photo scrapbook video",
    "AtVeAnimation",
  ],
  authors: [{ name: "Kumar Krishnanand" }],
  creator: "Kumar Krishnanand",
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "AtVeAnimation — AI Cartoon Video Generator",
    description: SITE_DESCRIPTION,
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "AtVeAnimation — turn your photo into a cartoon video" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "AtVeAnimation — AI Cartoon Video Generator",
    description: SITE_DESCRIPTION,
    images: ["/og-image.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: SITE_NAME,
  url: SITE_URL,
  logo: `${SITE_URL}/og-image.png`,
  sameAs: ["https://dev.to/kkjcodes"],
};

const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: SITE_NAME,
  url: SITE_URL,
  potentialAction: {
    "@type": "SearchAction",
    target: `${SITE_URL}/gallery?q={search_term_string}`,
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
      </head>
      <body className={`${geist.className} bg-zinc-50 text-zinc-900 antialiased min-h-screen`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
