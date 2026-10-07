import { describe, expect, it } from "vitest";
import { parsearMensajeEntrante } from "./adapters.ts";

const payloadMensajeTexto = {
  entry: [{
    changes: [{
      value: {
        messages: [{ id: "wamid.ABC123", from: "573001234567", type: "text", text: { body: "Hola" } }],
      },
    }],
  }],
};

const payloadStatusUpdate = {
  entry: [{ changes: [{ value: { statuses: [{ id: "wamid.XYZ", status: "delivered" }] } }] }],
};

describe("parsearMensajeEntrante", () => {
  it("extrae id, remitente y texto de un mensaje de texto", () => {
    expect(parsearMensajeEntrante(payloadMensajeTexto)).toEqual({
      messageId: "wamid.ABC123",
      from: "573001234567",
      texto: "Hola",
    });
  });

  it("devuelve null para un status update (sin mensaje)", () => {
    expect(parsearMensajeEntrante(payloadStatusUpdate)).toBeNull();
  });

  it("devuelve null para un payload vacio o malformado", () => {
    expect(parsearMensajeEntrante({})).toBeNull();
    expect(parsearMensajeEntrante(null)).toBeNull();
  });
});
