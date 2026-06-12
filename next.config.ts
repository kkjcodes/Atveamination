import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg"],
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
