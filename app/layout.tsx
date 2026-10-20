import type { Metadata, Viewport } from "next";
import { Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
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
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
