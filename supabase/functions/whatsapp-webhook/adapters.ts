export type MensajeEntrante =
  | { kind: "texto"; messageId: string; from: string; texto: string }
  | { kind: "audio"; messageId: string; from: string; mediaId: string }
  | { kind: "pedido_catalogo"; messageId: string; from: string; items: { retailerId: string; cantidad: number }[] };

export function parsearMensajeEntrante(payload: unknown): MensajeEntrante | null {
  const entry = (payload as Record<string, unknown> | null)?.entry as unknown[] | undefined;
  const primero = entry?.[0] as Record<string, unknown> | undefined;
  const cambios = primero?.changes as unknown[] | undefined;
  const valor = (cambios?.[0] as Record<string, unknown> | undefined)?.value as Record<string, unknown> | undefined;
  const mensajes = valor?.messages as Record<string, unknown>[] | undefined;
  const entrada = mensajes?.[0];

  if (!entrada || typeof entrada.id !== "string" || typeof entrada.from !== "string") {
    return null;
  }
  const { id: messageId, from } = entrada;

  if (entrada.type === "text") {
    const texto = (entrada.text as Record<string, unknown> | undefined)?.body;
    if (typeof texto !== "string") return null;
    return { kind: "texto", messageId, from, texto };
  }

  if (entrada.type === "audio") {
    const mediaId = (entrada.audio as Record<string, unknown> | undefined)?.id;
    if (typeof mediaId !== "string") return null;
    return { kind: "audio", messageId, from, mediaId };
  }

  // Mensaje nativo del carrito del catalogo: el cliente toco productos en
  // el carrusel (product_list), WhatsApp armo su propio carrito y lo envio
  // al tocar "Enviar al vendedor". Nunca se usa item_price/currency de aqui
  // -- se vuelve a resolver precio/stock reales por retailerId (sku) en
  // catalog.obtenerProductoPorSku, igual que con cualquier otro dato que
  // venga del cliente.
  if (entrada.type === "order") {
    const order = entrada.order as Record<string, unknown> | undefined;
    const productItems = order?.product_items as Record<string, unknown>[] | undefined;
    if (!Array.isArray(productItems) || productItems.length === 0) return null;

    const items: { retailerId: string; cantidad: number }[] = [];
    for (const item of productItems) {
      const retailerId = item.product_retailer_id;
      const cantidad = Number(item.quantity);
      if (typeof retailerId !== "string" || !Number.isFinite(cantidad) || cantidad <= 0) return null;
      items.push({ retailerId, cantidad });
    }
    return { kind: "pedido_catalogo", messageId, from, items };
  }

  return null;
}
