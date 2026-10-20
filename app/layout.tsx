import type { Metadata, Viewport } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import { MotionProvider } from "@/components/ui/motion-provider";
import { appOrigin } from "@/lib/auth/app-url";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

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
    default: "Sentate — Menú digital y reservas para tu local",
    template: "%s · Sentate",
  },
  description:
    "El menú digital y gestor de reservas que tu local gastronómico necesita. Listo en 10 minutos.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fbf8f4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${outfit.variable} ${jakarta.variable}`}>
      <body className="min-h-dvh">
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
