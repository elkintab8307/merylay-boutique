"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { LocalFavoriteItem } from "@/lib/favorites/local-favorites";

const guestFavoritesSchema = z
  .array(
    z.object({
      productId: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      price: z.number(),
      imageUrl: z.string().nullable(),
    }),
  )
  .max(200);

export async function mergeGuestFavorites(
  items: LocalFavoriteItem[],
): Promise<{ error?: string }> {
  const parsed = guestFavoritesSchema.safeParse(items);
  if (!parsed.success) {
    return { error: "No se pudieron fusionar los favoritos." };
  }
  if (parsed.data.length === 0) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { error } = await supabase.from("favorites").upsert(
    parsed.data.map((item) => ({ user_id: user.id, product_id: item.productId })),
    { onConflict: "user_id,product_id", ignoreDuplicates: true },
  );

  if (error) return { error: "No se pudieron fusionar los favoritos." };

  return {};
}
