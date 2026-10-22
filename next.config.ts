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

/** Origen de Supabase (REST/Auth/Storage por https y Realtime por wss), o null sin configurar. */
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!raw) return [];
  try {
    const url = new URL(raw);
    return [url.origin, `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}`];
  } catch {
    return [];
  }
}

/**
 * CSP en modo SOLO REPORTE: el navegador avisa en consola de lo que bloquearía, pero no bloquea nada. Pasar a modo
 * obligatorio (Content-Security-Policy) exige antes revisar que ninguna pantalla real genere avisos; una CSP mal armada rompe
 * la app en silencio. Next inyecta scripts en línea, por eso hoy lleva 'unsafe-inline' (lo ideal es un nonce por petición).
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: https://images.unsplash.com ${supabaseOrigins().filter((o) => o.startsWith("http")).join(" ")}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigins().join(" ")} https://tiles.openfreemap.org https://api.geoapify.com`.replace(/\s+/g, " "),
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * Cabeceras de seguridad para todas las rutas. HSTS lo agrega Vercel en el dominio.
 */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // La subida de fotos usa <input type="file"> (el sistema abre la cámara): no hace falta getUserMedia.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self), payment=(), usb=()" },
  { key: "Content-Security-Policy-Report-Only", value: csp },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Permite un build separado (p. ej. e2e contra Supabase local) sin pisar `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    remotePatterns: [{ protocol: "https", hostname: "images.unsplash.com" }, ...(storagePattern ? [storagePattern] : [])],
    dangerouslyAllowLocalIP: localSupabase,
    qualities: [75, 85],
  },
};

export default nextConfig;
