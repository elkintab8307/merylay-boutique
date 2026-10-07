import { createHash } from "node:crypto";
import { getSupabase } from "../_shared/db.ts";
import type { ItemCarrito } from "../_shared/types.ts";

// Mismo algoritmo que calcularFirmaIntegridad en src/lib/wompi/signature.ts
// del proyecto Next.js (no se puede importar entre runtimes distintos —
// Deno vs Node —, se duplica a proposito esta funcion de 3 lineas).
function calcularFirmaIntegridad(reference: string, amountInCents: number, currency: string, secret: string): string {
  return createHash("sha256").update(`${reference}${amountInCents}${currency}${secret}`).digest("hex");
}

export async function crearPedidoWompiDesdeCarrito(
  profileId: string,
  items: ItemCarrito[],
  direccionEnvio: Record<string, unknown>,
): Promise<{ linkPago: string; orderNumber: string }> {
  // Fail-closed: se valida ANTES de llamar a la RPC. Igual que en
  // src/app/(store)/checkout/wompi-actions.ts (obtenerCredencialesWompi),
  // si esto se revisara despues de crear_pedido_wompi_whatsapp, una variable
  // de entorno faltante dejaria un pedido real en estado "pendiente" ya
  // creado en la base de datos (con stock ya descontado), huerfano e
  // imposible de pagar, antes de que la funcion lance el error.
  const publicKey = Deno.env.get("WOMPI_PUBLIC_KEY");
  const secretoIntegridad = Deno.env.get("WOMPI_INTEGRITY_SECRET");
  const siteUrl = Deno.env.get("SITE_URL");
  if (!publicKey || !secretoIntegridad || !siteUrl) {
    throw new Error("Faltan WOMPI_PUBLIC_KEY, WOMPI_INTEGRITY_SECRET o SITE_URL.");
  }

  const supabase = getSupabase();

  const { data: pedido, error } = await supabase.rpc("crear_pedido_wompi_whatsapp", {
    p_user_id: profileId,
    p_items: items.map((item) => ({
      product_id: item.productId,
      variant_id: item.variantId,
      image_id: item.imageId,
      qty: item.qty,
    })),
    p_shipping_address: direccionEnvio,
  });

  if (error || !pedido) {
    throw new Error(error?.message ?? "No se pudo crear el pedido.");
  }

  const amountInCents = Math.round((pedido as { total: number }).total * 100);
  const firma = calcularFirmaIntegridad((pedido as { order_number: string }).order_number, amountInCents, "COP", secretoIntegridad);

  const parametros = new URLSearchParams({
    ref: (pedido as { order_number: string }).order_number,
    amount: String(amountInCents),
    currency: "COP",
    sig: firma,
  });

  return {
    linkPago: `${siteUrl}/checkout/wompi/whatsapp/${(pedido as { id: string }).id}?${parametros.toString()}`,
    orderNumber: (pedido as { order_number: string }).order_number,
  };
}
