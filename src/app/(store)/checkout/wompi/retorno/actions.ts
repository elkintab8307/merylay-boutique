"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type CompraParaPixel = {
  eventId: string;
  valor: number;
  productos: { id: string; name: string; price: number; quantity: number }[];
};

// Devuelve los datos del Purchase para el pixel del navegador, SOLO si el
// pedido esta pagado (lo confirma el webhook de Wompi, no los query params) y
// si aun no se habia reportado. El paso de "reclamo" es atomico: dos recargas
// simultaneas no pueden disparar dos compras.
export async function reclamarCompraParaPixel(orderId: string): Promise<CompraParaPixel | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: pedido } = await supabase
    .from("orders")
    .select("id, total, status, tiktok_tracked_at")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!pedido || pedido.status !== "pagado" || pedido.tiktok_tracked_at) return null;

  const admin = createAdminClient();
  const { data: reclamado, error } = await admin
    .from("orders")
    .update({ tiktok_tracked_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("tiktok_tracked_at", null)
    .select("id");
  if (error || !reclamado || reclamado.length === 0) return null;

  const { data: lineas } = await supabase
    .from("order_items")
    .select("product_id, name_snapshot, unit_price, qty")
    .eq("order_id", orderId);

  return {
    eventId: pedido.id,
    valor: Number(pedido.total),
    productos: (lineas ?? []).map((linea) => ({
      id: linea.product_id ?? linea.name_snapshot,
      name: linea.name_snapshot,
      price: linea.unit_price,
      quantity: linea.qty,
    })),
  };
}
