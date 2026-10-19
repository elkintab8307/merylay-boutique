import { getSupabase } from "../_shared/db.ts";
import { enviarTexto } from "../_shared/meta.ts";

// Llamada servicio-a-servicio desde el webhook de Wompi (src/app/api/webhooks/wompi/route.ts)
// justo tras confirmar el pago de un pedido del canal "whatsapp": esos
// pedidos pertenecen a un perfil con correo sintetico
// (<telefono>@merylay.local, ver supabase/functions/whatsapp-webhook/customers.ts),
// asi que el correo de confirmacion que usa el checkout web nunca le
// llegaria a la clienta. Aqui si viven las credenciales de la API de
// WhatsApp (META_ACCESS_TOKEN/META_PHONE_NUMBER_ID), igual que en
// notificar-pedido -- nunca se duplican en Vercel.

function formatoMoneda(valor: number): string {
  return `$${valor.toLocaleString("es-CO")}`;
}

interface Payload {
  orderId?: unknown;
}

interface Pedido {
  id: string;
  order_number: string;
  total: number;
  status: string;
  channel: string;
  user_id: string;
}

export async function handleRequest(req: Request): Promise<Response> {
  const secretoEsperado = Deno.env.get("CONFIRMAR_PAGO_WHATSAPP_SECRET") ?? "";
  const secretoRecibido = req.headers.get("x-confirmar-pago-whatsapp-secret") ?? "";
  if (!secretoEsperado || secretoRecibido !== secretoEsperado) {
    return new Response("No autorizado.", { status: 401 });
  }

  let payload: Payload;
  try {
    payload = (await req.json()) as Payload;
  } catch {
    return new Response("Cuerpo invalido.", { status: 400 });
  }

  const orderId = payload.orderId;
  if (typeof orderId !== "string" || orderId.trim() === "") {
    return new Response("Falta orderId.", { status: 400 });
  }

  const supabase = getSupabase();

  const { data, error: errorPedido } = await supabase
    .from("orders")
    .select("id, order_number, total, status, channel, user_id")
    .eq("id", orderId)
    .maybeSingle();
  const pedido = data as Pedido | null;

  if (errorPedido || !pedido) {
    console.error(`confirmar-pago-whatsapp: pedido ${orderId} no encontrado.`, errorPedido);
    return new Response("OK", { status: 200 });
  }

  // Defensivo: el unico llamador esperado (el webhook de Wompi) ya
  // comprobo que el pedido es de WhatsApp y que el pago se acaba de
  // confirmar, pero un endpoint de servicio a servicio nunca debe confiar
  // ciegamente en quien lo invoca.
  if (pedido.channel !== "whatsapp" || pedido.status !== "pagado") {
    console.error(
      `confirmar-pago-whatsapp: pedido ${orderId} no es un pedido de WhatsApp pagado (channel=${pedido.channel}, status=${pedido.status}) — no se envia nada.`,
    );
    return new Response("OK", { status: 200 });
  }

  const { data: perfilData } = await supabase
    .from("profiles")
    .select("whatsapp")
    .eq("id", pedido.user_id)
    .maybeSingle();
  const perfil = perfilData as { whatsapp: string | null } | null;
  const numero = (perfil?.whatsapp ?? "").replace(/\D/g, "");

  if (!numero) {
    console.error(
      `confirmar-pago-whatsapp: pedido ${orderId} sin numero de WhatsApp registrado para el cliente ${pedido.user_id}.`,
    );
    return new Response("OK", { status: 200 });
  }

  const { data: itemsData } = await supabase
    .from("order_items")
    .select("name_snapshot, qty, line_total")
    .eq("order_id", orderId);
  const items = (itemsData ?? []) as { name_snapshot: string; qty: number; line_total: number }[];

  const detalle = items
    .map(
      (item) =>
        `• ${item.qty > 1 ? `${item.qty}x ` : ""}${item.name_snapshot} — ${formatoMoneda(Number(item.line_total))}`,
    )
    .join("\n");

  const mensaje =
    `✅ ¡Tu pago quedó confirmado! 💕\n\n` +
    `Pedido ${pedido.order_number}\n${detalle}\n\n` +
    `💰 Total: ${formatoMoneda(Number(pedido.total))}\n\n` +
    `¡Gracias por tu compra en MeryLay Boutique! Pronto coordinamos el envío.`;

  try {
    await enviarTexto(numero, mensaje);
  } catch (error) {
    console.error(`confirmar-pago-whatsapp: fallo enviando el mensaje del pedido ${orderId}:`, error);
  }

  return new Response("OK", { status: 200 });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
