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

export async function enviarBotonProducto(
  to: string,
  opts: { fotoUrl: string; cuerpo: string; botonId: string; botonTitulo: string },
): Promise<void> {
  await enviarMensaje({
    to,
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "image", image: { link: opts.fotoUrl } },
      body: { text: opts.cuerpo },
      action: { buttons: [{ type: "reply", reply: { id: opts.botonId, title: opts.botonTitulo } }] },
    },
  });
}
