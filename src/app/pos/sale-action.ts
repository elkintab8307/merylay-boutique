"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { LocalCartItem } from "@/lib/cart/local-cart";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export async function registrarVenta(
  items: LocalCartItem[],
  paymentMethod: PaymentMethod,
  discount: number,
): Promise<{ error?: string }> {
  if (items.length === 0) {
    return { error: "Agrega al menos un producto a la venta." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_pos_sale", {
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
    p_payment_method: paymentMethod,
    p_discount: discount,
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo registrar la venta." };
  }

  redirect(`/pos/venta/${data.id}`);
}
