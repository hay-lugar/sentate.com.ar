import type { NextConfig } from "next";

/**
 * next/image solo puede optimizar imágenes del Storage de ESTE proyecto de Supabase (URLs firmadas del bucket
 * tenant-images) y las de las demos. El patrón sale de NEXT_PUBLIC_SUPABASE_URL: sin comodines de host.
 */
function storageImagePattern() {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return {
      protocol: url.protocol.replace(":", "") as "http" | "https",
      hostname: url.hostname,
      port: url.port,
      pathname: "/storage/v1/object/sign/tenant-images/**",
    };
  } catch {
    return null;
  }
}

const storagePattern = storageImagePattern();
// Next bloquea por defecto optimizar imágenes de IPs locales. Solo se levanta con un Supabase LOCAL (desarrollo y CI).
const localSupabase = storagePattern !== null && ["localhost", "127.0.0.1"].includes(storagePattern.hostname);

const nextConfig: NextConfig = {
  // Permite un build separado (p. ej. e2e contra Supabase local) sin pisar `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }, ...(storagePattern ? [storagePattern] : [])],
    dangerouslyAllowLocalIP: localSupabase,
    qualities: [75, 85],
  },
};

export default nextConfig;
