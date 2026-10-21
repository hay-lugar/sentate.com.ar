import { signInWithOAuthAction } from "@/app/(auth)/actions";
import { PROVIDER_LABEL, type OAuthProvider } from "@/lib/auth/providers";
import { buttonClass } from "@/components/ui/button";

/** Botones de ingreso externo. Sin proveedores habilitados no se muestra nada (ni un texto que prometa algo). */
export function OAuthButtons({ providers, next }: { providers: OAuthProvider[]; next?: string }) {
  if (!providers.length) return null;
  return (
    <div className="mt-6 space-y-3 border-t border-line pt-6">
      <p className="text-center type-help">O ingresá con</p>
      {providers.map((p) => (
        <form key={p} action={signInWithOAuthAction}>
          <input type="hidden" name="provider" value={p} />
          <input type="hidden" name="next" value={next ?? ""} />
          <button type="submit" className={buttonClass({ variant: "secondary", className: "w-full" })}>
            Continuar con {PROVIDER_LABEL[p]}
          </button>
        </form>
      ))}
    </div>
  );
}
