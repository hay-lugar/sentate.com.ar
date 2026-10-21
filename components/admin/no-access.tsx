import Link from "next/link";
import { signOutAction } from "@/app/(auth)/actions";
import { Button, buttonClass } from "@/components/ui/button";

/** El comercio existe (es público) pero el usuario no es miembro: sin acceso, distinto de 404. */
export function NoAccess({ email }: { email: string }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-sm place-items-center px-6">
      <div>
        <h1 className="text-2xl font-semibold">No tenés acceso a este panel</h1>
        <p className="mt-2 text-[15px] text-muted">
          Ingresaste como <span className="font-medium text-foreground">{email}</span>, que no administra este local.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link href="/admin" className={buttonClass()}>
            Ir a mis locales
          </Link>
          <form action={signOutAction}>
            <Button type="submit" variant="secondary">
              Cambiar de cuenta
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
