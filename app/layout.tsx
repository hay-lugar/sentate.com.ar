import type { Metadata, Viewport } from "next";
import { MotionProvider } from "@/components/ui/motion-provider";
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
    default: `${BRAND.name} — Carta digital y reservas para locales gastronómicos`,
    template: withBrand("%s"),
  },
  description:
    "Carta digital con QR y solicitudes de reserva para locales gastronómicos, con un panel para gestionarlas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Con el teclado abierto el contenido se reacomoda: la barra inferior y los botones de los sheets quedan sobre el teclado.
  interactiveWidget: "resizes-content",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <body className="min-h-dvh">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
