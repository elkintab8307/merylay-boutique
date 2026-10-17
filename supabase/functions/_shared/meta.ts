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

// Cuando Meta todavia no termino de procesar un SKU puntual (ej. no le ha
// recuperado la foto aunque el resto del catalogo si este listo), rechaza
// el producto con el error 131009 "product not found for
// product_retailer_id, <SKU>, in catalog_id, <ID>". Si el mensaje trae ese
// patron y el SKU senalado sigue en la lista actual, se devuelve para
// reintentar sin el -- si no, null (no es este tipo de error, no reintentar).
function productoInvalido(error: unknown, idsActuales: string[]): string | null {
  const mensaje = error instanceof Error ? error.message : String(error);
  const match = mensaje.match(/product not found for product_retailer_id,\s*([^,]+),\s*in catalog_id/);
  const id = match?.[1]?.trim();
  return id && idsActuales.includes(id) ? id : null;
}

// Carrusel nativo de WhatsApp (interactive carousel): entre 2 y 10 tarjetas
// de producto deslizables, mostradas DIRECTO en el chat -- a diferencia de
// product_list, no requiere que la clienta toque "Ver articulos" para verlas.
// Meta exige NO mandar header/footer/botones en este tipo, y cada tarjeta
// lleva su propio card_index (0-9, unico) y el mismo catalog_id. El cliente
// arma su propio carrito nativo tocando los productos y lo envia -- ese
// envio llega como un mensaje tipo "order" (ver adapters.ts).
//
// El mensaje es todo-o-nada: si UN solo product_retailer_id no esta listo
// en el catalogo de Meta, rechaza las demas tarjetas validas tambien (bug
// real reportado: un SKU puntual sin sincronizar tumbaba un lote de 10
// productos completo). Por eso reintenta quitando el SKU senalado por el
// error, mientras sigan quedando al menos 2 tarjetas (minimo de Meta).
export async function enviarCarruselProductos(
  to: string,
  opts: { cuerpo: string; retailerIds: string[] },
): Promise<void> {
  let idsActuales = opts.retailerIds;
  for (;;) {
    try {
      await enviarMensaje({
        to,
        type: "interactive",
        interactive: {
          type: "carousel",
          body: { text: opts.cuerpo },
          action: {
            cards: idsActuales.map((id, indice) => ({
              card_index: indice,
              type: "product",
              action: { catalog_id: catalogoId(), product_retailer_id: id },
            })),
          },
        },
      });
      return;
    } catch (error) {
      const idInvalido = productoInvalido(error, idsActuales);
      if (!idInvalido) throw error;
      const restantes = idsActuales.filter((id) => id !== idInvalido);
      if (restantes.length < 2) throw error;
      idsActuales = restantes;
    }
  }
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
