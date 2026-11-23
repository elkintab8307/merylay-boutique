// Guarda los datos de atribucion de TikTok de un pedido (ttclid, cookie _ttp,
// IP y user agent) para enviarlos luego en el Purchase del servidor.
// Fail-open: un fallo aqui nunca debe impedir crear el pedido ni pagarlo.
import { cookies, headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function guardarAtribucionPedido(orderId: string): Promise<void> {
  try {
    const almacen = await cookies();
    const cabeceras = await headers();

    const ttclid = almacen.get("ttclid")?.value ?? null;
    const ttp = almacen.get("_ttp")?.value ?? null;
    const ip = cabeceras.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
    const userAgent = cabeceras.get("user-agent");

    if (!ttclid && !ttp && !ip && !userAgent) return;

    const admin = createAdminClient();
    const { error } = await admin.from("order_attribution").upsert(
      {
        order_id: orderId,
        ttclid,
        ttp,
        client_ip: ip,
        user_agent: userAgent,
      },
      { onConflict: "order_id" },
    );
    if (error) {
      console.error(`[tiktok] No se guardo la atribucion del pedido ${orderId}:`, error);
    }
  } catch (error) {
    console.error(`[tiktok] Error guardando la atribucion del pedido ${orderId}:`, error);
  }
}
