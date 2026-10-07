import { verificarFirmaMeta } from "./meta-signature.ts";
import { procesarMensajeEntrante } from "./handler.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const tokenEsperado = Deno.env.get("META_VERIFY_TOKEN");
    if (modo === "subscribe" && tokenEsperado && token === tokenEsperado && challenge) {
      return new Response(challenge, { status: 200 });
    }
    console.warn(
      `[whatsapp-webhook] Handshake GET rechazado (modo=${modo}, token ${tokenEsperado ? "no coincide" : "META_VERIFY_TOKEN sin configurar"}).`,
    );
    return new Response("Token de verificacion invalido.", { status: 403 });
  }

  // Fail-closed: sin META_APP_SECRET no hay forma de verificar la firma.
  // Nunca se llama a verificarFirmaMeta con un secreto vacio (cualquiera
  // podria calcular HMAC("", payload) y suplantar cualquier numero,
  // incluidos los de los dueños).
  const appSecret = Deno.env.get("META_APP_SECRET");
  if (!appSecret) {
    console.error("[whatsapp-webhook] Falta META_APP_SECRET: se rechaza el webhook sin procesarlo.");
    return new Response("Webhook no configurado.", { status: 403 });
  }

  const payloadRaw = await req.text();
  const firma = req.headers.get("x-hub-signature-256");

  if (!verificarFirmaMeta(payloadRaw, firma, appSecret)) {
    console.warn("[whatsapp-webhook] Firma invalida en POST: se rechaza sin procesar.");
    return new Response("Firma invalida.", { status: 403 });
  }

  const payload = JSON.parse(payloadRaw);
  EdgeRuntime.waitUntil(
    Promise.resolve(procesarMensajeEntrante(payload)).catch((error) => {
      console.error("[whatsapp-webhook] Error procesando mensaje:", error);
    }),
  );

  return new Response("OK", { status: 200 });
}

if (import.meta.main) {
  Deno.serve(handleRequest);
}
