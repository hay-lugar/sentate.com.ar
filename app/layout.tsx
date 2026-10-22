import type { Metadata, Viewport } from "next";
import { appOrigin } from "@/lib/auth/app-url";
import { BRAND, withBrand } from "@/lib/config/brand";
import "./globals.css";

/** Base de las URLs de los metadatos (canónicas, redes). Sale de APP_URL; si no está configurada, se omite. */
function metadataBase(): URL | undefined {
  try {
    return new URL(appOrigin());
  } catch {
    return undefined;
  }
}

export const metadata: Metadata = {
  metadataBase: metadataBase(),
  applicationName: BRAND.name,
  title: {
    default: `${BRAND.name} — ${BRAND.defaultTitle}`,
    template: withBrand("%s"),
  },
  description: BRAND.description,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Con el teclado abierto el contenido se reacomoda: la barra inferior y los botones de los sheets quedan sobre el teclado.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: BRAND.themeColor },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh">
        {children}
      </body>
    </html>
  );
}
