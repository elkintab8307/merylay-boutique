"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { compraSchema, type CompraInput } from "@/lib/validation/compra";

export async function iniciarCompra(input: CompraInput): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = compraSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_purchase", {
    p_supplier_id: parsed.data.supplierId,
    p_purchase_date: parsed.data.purchaseDate,
    p_items: parsed.data.items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? null,
      qty: item.qty,
      unitCost: item.unitCost,
    })),
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo registrar la compra." };
  }

  redirect("/admin/compras");
}
