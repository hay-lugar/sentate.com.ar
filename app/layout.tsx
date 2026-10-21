import type { Metadata, Viewport } from "next";
import { MotionProvider } from "@/components/ui/motion-provider";
import { appOrigin } from "@/lib/auth/app-url";
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
  title: {
    default: "Sentate — Carta digital y reservas para locales gastronómicos",
    template: "%s · Sentate",
  },
  description:
    "Carta digital con QR y solicitudes de reserva para locales gastronómicos, con un panel para gestionarlas.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
