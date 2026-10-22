import type { MetadataRoute } from "next";
import { appOrigin } from "@/lib/auth/app-url";

/**
 * Lo público se indexa: la landing y las cartas (/<slug>). Lo privado no: panel, cuenta del comensal, API, ingreso, alta,
 * recuperación y los enlaces de email. (Las páginas privadas además llevan `noindex` en su metadata: robots.txt no es una barrera de
 * seguridad, solo una indicación.)
 */
export default function robots(): MetadataRoute.Robots {
  let sitemap: string | undefined;
  try {
    sitemap = `${appOrigin()}/sitemap.xml`;
  } catch {
    sitemap = undefined;
  }
  return {
    ...(sitemap ? { sitemap } : {}),
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/login", "/registro", "/recuperar", "/auth/", "/cuenta", "/superadmin", "/api/"] }],
  };
}
