import { supabaseServer } from "@/lib/data/live/queries";
import { TemporaryDataError } from "@/lib/data/live/result";
import { redact } from "@/lib/log/redact";
import type { MyReservation } from "./status";

export type FavoriteItem = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  business_type: string | null;
  price_range: string;
  cover_url: string | null;
  logo_url: string | null;
  locality: string | null;
  listed: boolean;
};

function check<T>(where: string, res: { data: T | null; error: { code?: string; message: string } | null }): T {
  if (res.error || res.data === null) {
    console.error(`[sentate] ${where}`, res.error?.code, redact(res.error?.message));
    throw new TemporaryDataError(where);
  }
  return res.data;
}

export async function getMyReservations(limit = 50, offset = 0) {
  const supabase = await supabaseServer();
  return check("tus reservas", await supabase.rpc("my_reservations", { p_limit: limit, p_offset: offset })) as { total: number; items: MyReservation[] };
}

export async function getMyReservation(id: string): Promise<MyReservation | null> {
  const supabase = await supabaseServer();
  const res = check("tu reserva", await supabase.rpc("my_reservations", { p_id: id, p_limit: 1, p_offset: 0 })) as { items: MyReservation[] };
  return res.items[0] ?? null;
}

export async function getMyFavorites() {
  const supabase = await supabaseServer();
  return check("tus favoritos", await supabase.rpc("my_favorites")) as FavoriteItem[];
}

export async function getMyFavoriteIds(): Promise<string[]> {
  try {
    return (await getMyFavorites()).map((f) => f.id);
  } catch {
    return [];
  }
}
