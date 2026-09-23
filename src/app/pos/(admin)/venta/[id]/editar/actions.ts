"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { LocalCartItem } from "@/lib/cart/local-cart";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

// Adonde vuelve el usuario tras guardar. Son dos destinos fijos (no una URL
// que llegue del cliente) para que la accion no pueda usarse como redirect
// abierto.
export type DestinoTrasEditar = "recibo" | "credito";

export async function actualizarVenta(
  saleId: string,
  items: LocalCartItem[],
  paymentMethod: PaymentMethod,
  discount: number,
  customerId: string | null,
  destino: DestinoTrasEditar = "recibo",
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
      imageId: item.imageId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
    p_payment_method: paymentMethod,
    p_discount: discount,
    p_customer_id: customerId ?? undefined,
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo actualizar la venta." };
  }

  redirect(destino === "credito" ? `/pos/creditos/${data.id}` : `/pos/venta/${data.id}`);
}
