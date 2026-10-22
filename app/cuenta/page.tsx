import Link from "next/link";
import { DeleteAccount } from "@/components/account/delete-account";
import { ProfileForm } from "@/components/account/profile-form";
import { buttonClass } from "@/components/ui/button";
import { PROVIDER_LABEL, isOAuthProvider } from "@/lib/auth/providers";
import { getMyTenantSlugs, supabaseServer } from "@/lib/data/live/queries";

export default async function CuentaPage() {
  const supabase = await supabaseServer();
  const [{ data: userData }, { data: profile }, tenants, adminRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("diner_profiles").select("display_name, phone").maybeSingle(),
    getMyTenantSlugs(),
    supabase.rpc("am_i_platform_admin"),
  ]);
  const user = userData.user;
  const providers = (user?.identities ?? []).map((i) => i.provider);
  const via = providers.map((p) => (isOAuthProvider(p) ? PROVIDER_LABEL[p] : p === "email" ? "Email y contraseña" : p)).join(", ");
  // El nombre del proveedor es solo una sugerencia editable; no se usa para nada de seguridad.
  const suggested = (user?.user_metadata?.full_name as string | undefined) ?? "";

  return (
    <div className="space-y-10">
      <section aria-labelledby="acc">
        <h2 id="acc" className="mb-3 type-section">
          Tu cuenta
        </h2>
        <dl className="space-y-1 text-[0.9375rem]">
          <div className="flex gap-2">
            <dt className="text-muted">Email:</dt>
            <dd>{user?.email}</dd>
          </div>
          {via && (
            <div className="flex gap-2">
              <dt className="text-muted">Ingresás con:</dt>
              <dd>{via}</dd>
            </div>
          )}
        </dl>
      </section>

      <section aria-labelledby="perfil">
        <h2 id="perfil" className="mb-3 type-section">
          Tus datos
        </h2>
        <div className="max-w-sm">
          <ProfileForm displayName={profile?.display_name || suggested} phone={profile?.phone ?? ""} />
        </div>
      </section>

      {tenants.status === "ok" && tenants.data.length > 0 && (
        <section aria-labelledby="locales">
          <h2 id="locales" className="mb-3 type-section">
            Tus locales
          </h2>
          <p className="mb-3 type-help">Iniciar sesión como comensal no da acceso a ningún local: tus permisos son los del local que administrás.</p>
          <Link href="/admin" className={buttonClass({ variant: "secondary" })}>
            Ir al panel
          </Link>
        </section>
      )}

      {adminRes.data === true && (
        <section aria-labelledby="sa">
          <h2 id="sa" className="mb-3 type-section">Plataforma</h2>
          <Link href="/superadmin" className={buttonClass({ variant: "secondary" })}>
            Ir al módulo de superadministración
          </Link>
        </section>
      )}

      <section aria-labelledby="datos">
        <h2 id="datos" className="mb-3 type-section">
          Tus datos y tu privacidad
        </h2>
        <p className="mb-3 type-help">Podés cerrar sesión desde el menú de arriba o eliminar tu cuenta.</p>
        <DeleteAccount />
      </section>
    </div>
  );
}
