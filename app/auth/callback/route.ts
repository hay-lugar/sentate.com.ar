import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { safeNext } from "@/lib/auth/redirects";
import { failedAuthPath, isCallbackOtpType } from "@/lib/auth/recovery";

/**
 * Destino de los enlaces de email.
 * - `token_hash` + `type` (plantilla de email con TokenHash): verifyOtp. Funciona en cualquier navegador.
 * - `code` (PKCE, mismo navegador que pidió el enlace): exchangeCodeForSession.
 * Un enlace vencido, inválido o ya usado vuelve a la pantalla correspondiente con un mensaje.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const next = safeNext(searchParams.get("next"));
  const destination = next ?? "/admin";
  const fail = () => NextResponse.redirect(`${origin}${failedAuthPath(next)}`);

  // Supabase informa el vencimiento o el uso previo en la query (p. ej. otp_expired).
  if (searchParams.get("error")) return fail();

  const supabase = createClient(await cookies());
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (tokenHash) {
    if (!isCallbackOtpType(type)) return fail();
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    return error ? fail() : NextResponse.redirect(`${origin}${destination}`);
  }

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    return error ? fail() : NextResponse.redirect(`${origin}${destination}`);
  }

  return fail();
}
