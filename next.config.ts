import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg"],
  // Explicitly exclude repo directories that must NEVER enter the standalone
  // trace. Runtime code uses process.cwd() to resolve /public/ paths, which
  // makes Turbopack conservatively include the entire working directory as
  // a fallback. Without these excludes, secrets (.env), personal photos
  // (Testing/), planning docs, and raw music sources would all be captured
  // in .next/standalone — even if the current Dockerfile doesn't COPY them
  // into the final image, the intermediate artifact is still on disk.
  //
  // Glob pattern: `**` matches every route/entry — Next.js applies the
  // excludes to the trace of every server-side entrypoint.
  outputFileTracingExcludes: {
    "**": [
      ".env*",
      "!.env.local.example",
      "music/**",
      "Testing/**",
      "Scrapbook Plan/**",
      "Images/**",
      "images/**",
      "Episodes.md",
      "nextsteps.md",
      "advertising.md",
      ".claude/**",
      "memory/**",
      "docs/**",
      "__tests__/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "node_modules/@next/swc-*",
      "node_modules/.cache/**",
    ],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "replicate.delivery" },
      { protocol: "https", hostname: "*.replicate.delivery" },
      { protocol: "https", hostname: "*.blob.core.windows.net" }, // Azure Blob Storage
      { protocol: "http", hostname: "127.0.0.1" },        // Azurite local
      { protocol: "http", hostname: "localhost" },          // Azurite local (alt)
    ],
  },
};

export default nextConfig;
