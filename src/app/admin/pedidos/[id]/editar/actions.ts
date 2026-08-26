"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { LocalCartItem } from "@/lib/cart/local-cart";

export async function actualizarPedidoItems(
  orderId: string,
  items: LocalCartItem[],
): Promise<{ error?: string }> {
  await requireAdmin();

  if (items.length === 0) {
    return { error: "El pedido debe tener al menos un producto." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("update_order_items", {
    p_order_id: orderId,
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      imageId: item.imageId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo actualizar el pedido." };
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${data.id}`);
  redirect(`/admin/pedidos/${data.id}`);
}
