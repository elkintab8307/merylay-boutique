import { describe, expect, it } from "vitest";
import {
  ESTADOS_PEDIDO,
  ESTADO_PEDIDO_LABELS,
  estadoPedidoSchema,
} from "../pedido";

describe("estadoPedidoSchema", () => {
  it("acepta los cinco estados validos", () => {
    for (const estado of [
      "pendiente",
      "pagado",
      "enviado",
      "entregado",
      "cancelado",
    ]) {
      expect(estadoPedidoSchema.safeParse(estado).success).toBe(true);
    }
  });

  it("rechaza un estado inexistente", () => {
    expect(estadoPedidoSchema.safeParse("cualquiercosa").success).toBe(false);
  });

  it("rechaza cadena vacia y valores no string", () => {
    expect(estadoPedidoSchema.safeParse("").success).toBe(false);
    expect(estadoPedidoSchema.safeParse(undefined).success).toBe(false);
    expect(estadoPedidoSchema.safeParse(null).success).toBe(false);
    expect(estadoPedidoSchema.safeParse(3).success).toBe(false);
    expect(estadoPedidoSchema.safeParse(["pendiente"]).success).toBe(false);
  });

  it("rechaza estados con mayusculas o espacios", () => {
    expect(estadoPedidoSchema.safeParse("Pendiente").success).toBe(false);
    expect(estadoPedidoSchema.safeParse(" pendiente ").success).toBe(false);
  });
});

describe("ESTADOS_PEDIDO", () => {
  it("cubre exactamente los valores del schema y en orden", () => {
    expect(ESTADOS_PEDIDO.map((e) => e.value)).toEqual([
      "pendiente",
      "pagado",
      "enviado",
      "entregado",
      "cancelado",
    ]);
    expect(ESTADOS_PEDIDO.map((e) => e.value).sort()).toEqual(
      [...estadoPedidoSchema.options].sort(),
    );
  });

  it("expone una etiqueta para cada estado", () => {
    for (const estado of estadoPedidoSchema.options) {
      expect(ESTADO_PEDIDO_LABELS[estado]).toBeTruthy();
    }
  });
});
