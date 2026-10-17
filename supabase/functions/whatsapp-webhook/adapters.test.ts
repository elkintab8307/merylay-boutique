import { describe, expect, it } from "vitest";
import { parsearMensajeEntrante } from "./adapters.ts";

function payloadMensaje(mensaje: Record<string, unknown>) {
  return { entry: [{ changes: [{ value: { messages: [mensaje] } }] }] };
}

describe("parsearMensajeEntrante", () => {
  it("extrae id, remitente y texto de un mensaje de texto", () => {
    const payload = payloadMensaje({ id: "wamid.ABC123", from: "573001234567", type: "text", text: { body: "Hola" } });
    expect(parsearMensajeEntrante(payload)).toEqual({ kind: "texto", messageId: "wamid.ABC123", from: "573001234567", texto: "Hola" });
  });

  it("extrae id, remitente y mediaId de una nota de voz", () => {
    const payload = payloadMensaje({ id: "wamid.AUDIO1", from: "573001234567", type: "audio", audio: { id: "media-999", mime_type: "audio/ogg" } });
    expect(parsearMensajeEntrante(payload)).toEqual({ kind: "audio", messageId: "wamid.AUDIO1", from: "573001234567", mediaId: "media-999" });
  });

  it("un boton de respuesta interactivo (ya no soportado -- reemplazado por el carrito nativo del catalogo) devuelve null", () => {
    const payload = payloadMensaje({
      id: "wamid.BOTON1", from: "573001234567", type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "add:p1:v1", title: "Agregar al carrito" } },
    });
    expect(parsearMensajeEntrante(payload)).toBeNull();
  });

  it("extrae id, remitente e items (retailerId + cantidad) de un pedido armado en el carrito nativo del catalogo", () => {
    const payload = payloadMensaje({
      id: "wamid.ORDER1", from: "573001234567", type: "order",
      order: {
        catalog_id: "1832369491097812",
        product_items: [
          { product_retailer_id: "SKU-P1", quantity: "2", item_price: "89900", currency: "COP" },
          { product_retailer_id: "SKU-P2-M", quantity: "1", item_price: "48000", currency: "COP" },
        ],
      },
    });
    expect(parsearMensajeEntrante(payload)).toEqual({
      kind: "pedido_catalogo",
      messageId: "wamid.ORDER1",
      from: "573001234567",
      items: [{ retailerId: "SKU-P1", cantidad: 2 }, { retailerId: "SKU-P2-M", cantidad: 1 }],
    });
  });

  it("un pedido del catalogo sin product_items (o malformado) devuelve null", () => {
    const payload = payloadMensaje({ id: "wamid.ORDER2", from: "573001234567", type: "order", order: {} });
    expect(parsearMensajeEntrante(payload)).toBeNull();
  });

  it("devuelve null para un status update (sin mensaje)", () => {
    expect(parsearMensajeEntrante({ entry: [{ changes: [{ value: { statuses: [{ id: "wamid.XYZ", status: "delivered" }] } }] }] })).toBeNull();
  });

  it("devuelve null para un payload vacio o malformado", () => {
    expect(parsearMensajeEntrante({})).toBeNull();
    expect(parsearMensajeEntrante(null)).toBeNull();
  });

  it("devuelve null para un tipo de mensaje no soportado (ej. ubicacion)", () => {
    const payload = payloadMensaje({ id: "wamid.LOC1", from: "573001234567", type: "location", location: {} });
    expect(parsearMensajeEntrante(payload)).toBeNull();
  });
});
