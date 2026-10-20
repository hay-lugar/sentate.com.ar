import { createServerClient } from "@supabase/ssr";
import type { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/** Cliente para Server Components, Server Actions y Route Handlers. */
export const createClient = (cookieStore: Awaited<ReturnType<typeof cookies>>) => {
  const { url, key } = getSupabaseEnv();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Llamado desde un Server Component: lo ignora porque proxy.ts refresca la sesión.
        }
      },
    },
  });
};
