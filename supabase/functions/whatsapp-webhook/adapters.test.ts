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

  it("extrae id, remitente y botonId de un boton de respuesta interactivo", () => {
    const payload = payloadMensaje({
      id: "wamid.BOTON1", from: "573001234567", type: "interactive",
      interactive: { type: "button_reply", button_reply: { id: "add:p1:v1", title: "Agregar al carrito" } },
    });
    expect(parsearMensajeEntrante(payload)).toEqual({ kind: "boton", messageId: "wamid.BOTON1", from: "573001234567", botonId: "add:p1:v1" });
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
