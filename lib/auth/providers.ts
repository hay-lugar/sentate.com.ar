// Proveedores de ingreso externos. Un botón solo aparece si Supabase Auth informa que ese proveedor está HABILITADO
// (GET /auth/v1/settings): un proveedor sin configurar nunca se muestra como si funcionara.

export const OAUTH_PROVIDERS = ["google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };

export const isOAuthProvider = (v: unknown): v is OAuthProvider => typeof v === "string" && (OAUTH_PROVIDERS as readonly string[]).includes(v);

/** Interpreta la respuesta de /auth/v1/settings. Cualquier forma inesperada = proveedor deshabilitado. */
export function enabledProviders(settings: unknown): OAuthProvider[] {
  const external = (settings as { external?: Record<string, unknown> } | null)?.external;
  if (!external || typeof external !== "object") return [];
  return OAUTH_PROVIDERS.filter((p) => external[p] === true);
}

export async function fetchEnabledProviders(fetcher: typeof fetch = fetch): Promise<OAuthProvider[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return [];
  try {
    const res = await fetcher(`${url}/auth/v1/settings`, { headers: { apikey: key }, next: { revalidate: 60 }, signal: AbortSignal.timeout(4000) } as RequestInit);
    if (!res.ok) return [];
    return enabledProviders(await res.json());
  } catch {
    return [];
  }
}
