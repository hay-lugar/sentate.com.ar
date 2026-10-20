import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { isSupabaseConfigured, getSupabaseEnv } from "./env";

/**
 * Refresca la sesión de Supabase en cada request (usado por proxy.ts).
 * Sin la llamada a getClaims() el token vencido nunca se renovaría.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  if (!isSupabaseConfigured()) return supabaseResponse;

  const { url, key } = getSupabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  // No poner lógica entre createServerClient y getClaims(): puede desloguear usuarios al azar.
  await supabase.auth.getClaims();

  return supabaseResponse;
}
