"use server";

import { createClient } from "@/lib/supabase/server";
import { getOrCreateCart } from "@/lib/cart/get-or-create-cart";
import type { LocalCartItem } from "@/lib/cart/local-cart";

export async function mergeGuestCart(items: LocalCartItem[]): Promise<{ error?: string }> {
  if (items.length === 0) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const cartId = await getOrCreateCart(user.id);

  for (const item of items) {
    let existingQuery = supabase
      .from("cart_items")
      .select("id, qty")
      .eq("cart_id", cartId)
      .eq("product_id", item.productId);
    existingQuery = item.variantId
      ? existingQuery.eq("variant_id", item.variantId)
      : existingQuery.is("variant_id", null);
    existingQuery = item.imageId
      ? existingQuery.eq("image_id", item.imageId)
      : existingQuery.is("image_id", null);
    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      await supabase
        .from("cart_items")
        .update({ qty: existing.qty + item.qty })
        .eq("id", existing.id);
    } else {
      await supabase.from("cart_items").insert({
        cart_id: cartId,
        product_id: item.productId,
        variant_id: item.variantId,
        image_id: item.imageId,
        qty: item.qty,
        unit_price: item.unitPrice,
      });
    }
  }

  return {};
}
