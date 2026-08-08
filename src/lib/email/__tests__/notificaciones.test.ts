import { describe, expect, it } from "vitest";
import { debeNotificarCambioEstado } from "../notificaciones";

describe("debeNotificarCambioEstado", () => {
  it("notifica cuando el pedido se marca enviado", () => {
    expect(debeNotificarCambioEstado("enviado")).toBe(true);
  });

  it("notifica cuando el pedido se marca entregado", () => {
    expect(debeNotificarCambioEstado("entregado")).toBe(true);
  });

  it("notifica cuando el pedido se marca cancelado", () => {
    expect(debeNotificarCambioEstado("cancelado")).toBe(true);
  });

  it("no notifica cuando el pedido se marca pagado (tiene su propio correo)", () => {
    expect(debeNotificarCambioEstado("pagado")).toBe(false);
  });

  it("no notifica cuando el pedido se marca pendiente", () => {
    expect(debeNotificarCambioEstado("pendiente")).toBe(false);
  });

  it("no notifica para un valor invalido", () => {
    expect(debeNotificarCambioEstado("cualquiercosa")).toBe(false);
  });
});
