// Events API de TikTok (servidor). Solo se usa desde el webhook de Wompi y
// nunca llega al cliente: el token vive en TIKTOK_EVENTS_API_TOKEN.
// Fail-open: si falta alguna variable o TikTok falla, se registra y se sigue.
import { createHash } from "node:crypto";

const ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/event/track/";
const TIMEOUT_MS = 5000;
const MONEDA = "COP";

export type ItemCompraTikTok = {
  productId: string;
  nombre: string;
  precio: number;
  qty: number;
};

export type CompraTikTokInput = {
  pedidoId: string;
  total: number;
  items: ItemCompraTikTok[];
  email?: string | null;
  telefono?: string | null;
  userId?: string | null;
  ttclid?: string | null;
  ttp?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  urlPagina?: string;
  eventTime: number; // segundos desde epoch
  testEventCode?: string | null;
};

export function hashTikTok(valor: string): string {
  return createHash("sha256").update(valor.trim().toLowerCase()).digest("hex");
}

// Telefono colombiano a E.164 (+57...). Devuelve null si no se reconoce.
export function normalizarTelefonoE164(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, "");
  if (digitos.length === 10) return `+57${digitos}`;
  if (digitos.length === 12 && digitos.startsWith("57")) return `+${digitos}`;
  return null;
}

export function construirEventoCompra(input: CompraTikTokInput, pixelId: string) {
  const user: Record<string, string> = {};
  if (input.email) user.email = hashTikTok(input.email);
  if (input.telefono) {
    const e164 = normalizarTelefonoE164(input.telefono);
    if (e164) user.phone = hashTikTok(e164);
  }
  if (input.userId) user.external_id = hashTikTok(input.userId);
  if (input.ip) user.ip = input.ip;
  if (input.userAgent) user.user_agent = input.userAgent;
  if (input.ttclid) user.ttclid = input.ttclid;
  if (input.ttp) user.ttp = input.ttp;

  const evento: Record<string, unknown> = {
    event_source: "web",
    event_source_id: pixelId,
    data: [
      {
        event: "Purchase",
        event_time: input.eventTime,
        event_id: input.pedidoId,
        user,
        properties: {
          currency: MONEDA,
          value: input.total,
          contents: input.items.map((item) => ({
            content_id: item.productId,
            content_type: "product",
            content_name: item.nombre,
            price: item.precio,
            quantity: item.qty,
          })),
        },
        page: { url: input.urlPagina ?? "https://merylay.shop" },
      },
    ],
  };
  if (input.testEventCode) evento.test_event_code = input.testEventCode;
  return evento;
}

export type ResultadoTikTok = { enviado: true } | { enviado: false; motivo?: string };

export async function reportarCompraTikTok(
  input: CompraTikTokInput,
  opciones: { fetch?: typeof fetch } = {},
): Promise<ResultadoTikTok> {
  const pixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  const token = process.env.TIKTOK_EVENTS_API_TOKEN;
  if (!pixelId || !token) return { enviado: false, motivo: "desactivado" };

  const evento = construirEventoCompra(
    { ...input, testEventCode: input.testEventCode ?? process.env.TIKTOK_TEST_EVENT_CODE ?? null },
    pixelId,
  );
  const fetchFn = opciones.fetch ?? fetch;

  try {
    const respuesta = await fetchFn(ENDPOINT, {
      method: "POST",
      headers: { "Access-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify(evento),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!respuesta.ok) {
      console.error(`[tiktok] Events API respondio ${respuesta.status} para el pedido ${input.pedidoId}.`);
      return { enviado: false, motivo: `http ${respuesta.status}` };
    }
    return { enviado: true };
  } catch (error) {
    console.error(`[tiktok] Error enviando Purchase del pedido ${input.pedidoId}:`, error);
    return { enviado: false, motivo: "red" };
  }
}
