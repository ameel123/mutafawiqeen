import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Book PDFs are rendered in the browser with pdf.js; keep its worker as a static asset.
  serverExternalPackages: ["postgres"],
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
