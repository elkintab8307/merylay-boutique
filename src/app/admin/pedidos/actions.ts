"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { estadoPedidoSchema } from "@/lib/validation/pedido";

export async function cambiarEstadoPedido(
  orderId: string,
  nuevoEstado: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = estadoPedidoSchema.safeParse(nuevoEstado);
  if (!parsed.success) {
    return { error: "Estado inválido." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status: parsed.data })
    .eq("id", orderId);

  if (error) {
    return { error: "No se pudo actualizar el pedido." };
  }

  revalidatePath("/admin/pedidos");
  revalidatePath(`/admin/pedidos/${orderId}`);
  return {};
}
