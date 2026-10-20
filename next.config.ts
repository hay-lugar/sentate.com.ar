import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite un build separado (p. ej. e2e contra Supabase local) sin pisar `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }],
    qualities: [75, 85],
  },
};

export default nextConfig;
