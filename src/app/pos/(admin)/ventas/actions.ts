"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";

export async function eliminarVenta(saleId: string): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_pos_sale", { p_sale_id: saleId });

  if (error) {
    return { error: error.message ?? "No se pudo eliminar la venta." };
  }

  revalidatePath("/pos/ventas");
  return {};
}
