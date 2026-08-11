"use server";

import { createClient } from "@/lib/supabase/server";
import type { LocalFavoriteItem } from "@/lib/favorites/local-favorites";

export async function mergeGuestFavorites(
  items: LocalFavoriteItem[],
): Promise<{ error?: string }> {
  if (items.length === 0) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { error } = await supabase.from("favorites").upsert(
    items.map((item) => ({ user_id: user.id, product_id: item.productId })),
    { onConflict: "user_id,product_id", ignoreDuplicates: true },
  );

  if (error) return { error: "No se pudieron fusionar los favoritos." };

  return {};
}
