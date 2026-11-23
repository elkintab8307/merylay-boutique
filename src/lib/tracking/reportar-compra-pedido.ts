// Envia el Purchase de un pedido recien pagado a la Events API de TikTok.
// Lo llama el webhook de Wompi, solo cuando el pedido acaba de pasar a pagado.
// Idempotente: el reclamo atomico (tiktok_reported_at) evita reenviar la misma
// compra. Fail-open: nunca lanza, para no afectar el procesamiento del pago.
import { createAdminClient } from "@/lib/supabase/admin";
import { reportarCompraTikTok, type CompraTikTokInput } from "@/lib/tracking/tiktok-server";

const SITE_URL = "https://merylay.shop";

export async function reportarCompraPedido(
  admin: ReturnType<typeof createAdminClient>,
  orderId: string,
): Promise<void> {
  try {
    // Sin token no hay nada que enviar: no se reclama el pedido, asi que si se
    // configura despues, las compras nuevas si se reportan.
    if (!process.env.TIKTOK_EVENTS_API_TOKEN) return;

    const { data: reclamado } = await admin
      .from("orders")
      .update({ tiktok_reported_at: new Date().toISOString() })
      .eq("id", orderId)
      .is("tiktok_reported_at", null)
      .select("id");
    if (!reclamado || reclamado.length === 0) return;

    const { data: pedido } = await admin
      .from("orders")
      .select("id, order_number, total, user_id, shipping_address")
      .eq("id", orderId)
      .single();
    if (!pedido) return;

    const [{ data: lineas }, { data: atribucion }, { data: usuario }] = await Promise.all([
      admin.from("order_items").select("product_id, name_snapshot, unit_price, qty").eq("order_id", orderId),
      admin.from("order_attribution").select("ttclid, ttp, client_ip, user_agent").eq("order_id", orderId).maybeSingle(),
      admin.auth.admin.getUserById(pedido.user_id),
    ]);

    const direccion = pedido.shipping_address as { phone?: string } | null;
    const correo = usuario.user?.email && !usuario.user.email.endsWith("@merylay.local") ? usuario.user.email : null;

    const compra: CompraTikTokInput = {
      pedidoId: pedido.id,
      total: Number(pedido.total),
      items: (lineas ?? []).map((linea) => ({
        productId: linea.product_id ?? linea.name_snapshot,
        nombre: linea.name_snapshot,
        precio: linea.unit_price,
        qty: linea.qty,
      })),
      email: correo,
      telefono: direccion?.phone ?? null,
      userId: pedido.user_id,
      ttclid: atribucion?.ttclid ?? null,
      ttp: atribucion?.ttp ?? null,
      ip: atribucion?.client_ip ?? null,
      userAgent: atribucion?.user_agent ?? null,
      urlPagina: `${SITE_URL}/checkout/wompi/retorno?orderId=${pedido.id}`,
      eventTime: Math.floor(Date.now() / 1000),
    };

    const resultado = await reportarCompraTikTok(compra);
    if (!resultado.enviado) {
      console.error(`[tiktok] Purchase del pedido ${pedido.order_number} no enviado: ${resultado.motivo ?? "desconocido"}.`);
    }
  } catch (error) {
    console.error(`[tiktok] Error reportando la compra del pedido ${orderId}:`, error);
  }
}
