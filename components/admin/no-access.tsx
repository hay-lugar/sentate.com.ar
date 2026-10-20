import Link from "next/link";
import { Lock } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";

/** El comercio existe (es público) pero el usuario no es miembro: sin acceso, distinto de 404. */
export function NoAccess({ email }: { email: string }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6">
      <div className="max-w-sm text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-surface shadow-soft ring-1 ring-line">
          <Lock className="size-6" aria-hidden />
        </span>
        <h1 className="mt-4 text-xl font-bold">No tenés acceso a este panel</h1>
        <p className="mt-2 text-[15px] text-muted">
          Ingresaste como <span className="font-semibold text-foreground">{email}</span>, que no administra este local.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link href="/admin" className="pressable inline-flex h-12 items-center rounded-2xl bg-ink px-5 font-semibold text-white shadow-lift">
            Ir a mis locales
          </Link>
          <form action={signOutAction}>
            <button type="submit" className="pressable h-12 rounded-2xl px-5 font-semibold ring-1 ring-line">
              Cambiar de cuenta
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
