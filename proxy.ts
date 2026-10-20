import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

// Next 16: `middleware` pasó a llamarse `proxy` (runtime nodejs).
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Todo menos assets estáticos e imágenes optimizadas.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)"],
};
