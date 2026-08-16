"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { LocalCartItem } from "@/lib/cart/local-cart";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export async function actualizarVenta(
  saleId: string,
  items: LocalCartItem[],
  paymentMethod: PaymentMethod,
  discount: number,
): Promise<{ error?: string }> {
  await requireAdmin();

  if (items.length === 0) {
    return { error: "La venta debe tener al menos un producto." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_pos_sale", {
    p_sale_id: saleId,
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
    return { error: error?.message ?? "No se pudo actualizar la venta." };
  }

  redirect(`/pos/venta/${data.id}`);
}
