import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  devIndicators: { position: "bottom-right" },
  experimental: {
    serverActions: {
      // Bank exports are small (a 200-row export is ~170 KB). The action itself
      // rejects files over 10 MB; the extra room is for the multipart envelope
      // and for several files uploaded at once.
      bodySizeLimit: "32mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
