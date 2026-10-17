function credenciales(): { token: string; phoneNumberId: string } {
  const token = Deno.env.get("META_ACCESS_TOKEN");
  const phoneNumberId = Deno.env.get("META_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    throw new Error("Faltan META_ACCESS_TOKEN o META_PHONE_NUMBER_ID.");
  }
  return { token, phoneNumberId };
}

async function enviarMensaje(payload: Record<string, unknown>): Promise<void> {
  const { token, phoneNumberId } = credenciales();
  const respuesta = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });

  if (!respuesta.ok) {
    const cuerpo = await respuesta.text();
    throw new Error(`Graph API respondio ${respuesta.status}: ${cuerpo}`);
  }
}

export async function enviarTexto(to: string, body: string): Promise<void> {
  await enviarMensaje({ to, type: "text", text: { body } });
}

export async function enviarImagenPorLink(to: string, link: string, caption?: string): Promise<void> {
  await enviarMensaje({ to, type: "image", image: { link, caption } });
}

export async function enviarDocumentoPorLink(to: string, link: string, filename: string): Promise<void> {
  await enviarMensaje({ to, type: "document", document: { link, filename } });
}

// Marca el mensaje entrante como leido y activa el indicador de "escribiendo..."
// (los 3 puntos) por hasta 25 segundos o hasta que se envie un mensaje real --
// justo la ventana que tarda la llamada a OpenAI/la base de datos antes de
// responder. Mismo endpoint que el resto de mensajes salientes, pero sin "to":
// la Graph API identifica el chat por message_id.
export async function marcarLeidoYEscribiendo(messageId: string): Promise<void> {
  await enviarMensaje({ status: "read", message_id: messageId, typing_indicator: { type: "text" } });
}

export async function obtenerUrlMedia(mediaId: string): Promise<string> {
  const { token } = credenciales();
  const respuesta = await fetch(`https://graph.facebook.com/v21.0/${mediaId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!respuesta.ok) {
    throw new Error(`Graph API respondio ${respuesta.status} al pedir la url del medio ${mediaId}.`);
  }
  const cuerpo = await respuesta.json();
  return cuerpo.url as string;
}

export async function descargarMedia(url: string): Promise<Uint8Array> {
  const { token } = credenciales();
  const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!respuesta.ok) {
    throw new Error(`No se pudo descargar el medio: la Graph API respondio ${respuesta.status}.`);
  }
  return new Uint8Array(await respuesta.arrayBuffer());
}

function catalogoId(): string {
  const id = Deno.env.get("META_CATALOG_ID");
  if (!id) throw new Error("Falta META_CATALOG_ID.");
  return id;
}

// Carrusel nativo de WhatsApp (interactive product_list): hasta 10 secciones
// y 30 items en total, cada uno referenciado por su retailer_id (el sku en
// nuestro catalogo). El cliente arma su propio carrito nativo tocando los
// productos y lo envia -- ese envio llega como un mensaje tipo "order" (ver
// adapters.ts), no como el boton de respuesta que se usaba antes.
export async function enviarListaProductos(
  to: string,
  opts: { cuerpo: string; encabezado: string; secciones: { titulo: string; retailerIds: string[] }[] },
): Promise<void> {
  await enviarMensaje({
    to,
    type: "interactive",
    interactive: {
      type: "product_list",
      // WhatsApp EXIGE este campo para product_list -- sin el, la Graph API
      // responde 400 (#131009 "interactive['header'] is required") y el
      // mensaje nunca llega (bug real: antes era opcional aqui, y el
      // llamador no siempre lo mandaba).
      header: { type: "text", text: opts.encabezado },
      body: { text: opts.cuerpo },
      action: {
        catalog_id: catalogoId(),
        sections: opts.secciones.map((s) => ({
          title: s.titulo,
          product_items: s.retailerIds.map((id) => ({ product_retailer_id: id })),
        })),
      },
    },
  });
}

// Mensaje interactivo de UN solo producto del catalogo -- usado cuando el
// cliente llega desde el boton "Preguntar por WhatsApp" de una pagina de
// producto especifica (ya se identifico el producto exacto por su slug).
export async function enviarProductoUnico(to: string, opts: { cuerpo: string; retailerId: string }): Promise<void> {
  await enviarMensaje({
    to,
    type: "interactive",
    interactive: {
      type: "product",
      body: { text: opts.cuerpo },
      action: { catalog_id: catalogoId(), product_retailer_id: opts.retailerId },
    },
  });
}
