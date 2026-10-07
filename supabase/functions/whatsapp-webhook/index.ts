import { verificarFirmaMeta } from "./meta-signature.ts";
import { procesarMensajeEntrante } from "./handler.ts";

declare const EdgeRuntime: { waitUntil: (promise: Promise<unknown>) => void };

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (req.method === "GET") {
    const modo = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (modo === "subscribe" && token === Deno.env.get("META_VERIFY_TOKEN") && challenge) {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Token de verificacion invalido.", { status: 403 });
  }

  const payloadRaw = await req.text();
  const firma = req.headers.get("x-hub-signature-256");
  const appSecret = Deno.env.get("META_APP_SECRET") ?? "";

  if (!verificarFirmaMeta(payloadRaw, firma, appSecret)) {
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
