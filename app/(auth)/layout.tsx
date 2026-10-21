import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { BRAND } from "@/lib/config/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col px-5 py-10 sm:justify-center sm:py-16">
      <Link href="/" aria-label={`${BRAND.name}, inicio`} className="mb-10 self-center">
        <Logo size="lg" />
      </Link>
      {children}
    </main>
  );
}
