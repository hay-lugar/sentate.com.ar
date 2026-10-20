import Link from "next/link";
import { Logo } from "@/components/ui/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[30rem] w-[50rem] -translate-x-1/2 rounded-full bg-brand/12 blur-[120px]" />
      </div>
      <div className="relative w-full max-w-md">
        <Link href="/" className="mb-8 flex justify-center" aria-label="Sentate, inicio">
          <Logo />
        </Link>
        <div className="rounded-[2rem] bg-surface p-6 shadow-lift ring-1 ring-line/70 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
