import { enviarTexto } from "../_shared/meta.ts";

interface PayloadWebhook {
  type: string;
  table: "orders" | "pos_sales";
  record: Record<string, unknown>;
}

function formatoMoneda(valor: number): string {
  return `$${valor.toLocaleString("es-CO")}`;
}

function resumenVenta(payload: PayloadWebhook): string {
  if (payload.table === "orders") {
    const r = payload.record as { order_number: string; total: number; channel: string };
    return `🛍️ Pedido nuevo (${r.channel}): ${r.order_number} — ${formatoMoneda(r.total)}`;
  }
  const r = payload.record as { sale_number: string; total: number };
  return `🛍️ Venta nueva en el POS: ${r.sale_number} — ${formatoMoneda(r.total)}`;
}

export async function handleRequest(req: Request): Promise<Response> {
  const secretoEsperado = Deno.env.get("NOTIFICAR_PEDIDO_SECRET") ?? "";
  const secretoRecibido = req.headers.get("x-notificar-pedido-secret") ?? "";
  if (!secretoEsperado || secretoRecibido !== secretoEsperado) {
    return new Response("No autorizado.", { status: 401 });
  }

  const payload = (await req.json()) as PayloadWebhook;
  const mensaje = resumenVenta(payload);

  const numeros = (Deno.env.get("WHATSAPP_OWNER_NUMBERS") ?? "").split(",").map((n) => n.trim()).filter(Boolean);

  const resultados = await Promise.allSettled(numeros.map((numero) => enviarTexto(numero, mensaje)));
  for (const [i, resultado] of resultados.entries()) {
    if (resultado.status === "rejected") {
      console.error(`notificar-pedido: fallo al enviar a ${numeros[i]}:`, resultado.reason);
    }
  }

  return new Response("OK", { status: 200 });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
