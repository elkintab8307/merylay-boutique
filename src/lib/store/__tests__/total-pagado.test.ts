import { describe, expect, it } from "vitest";
import { calcularTotalPagado } from "../total-pagado";

describe("calcularTotalPagado", () => {
  it("suma solo pedidos pagado, enviado y entregado", () => {
    const pedidos = [
      { status: "pendiente", total: 100000 },
      { status: "pagado", total: 50000 },
      { status: "enviado", total: 30000 },
      { status: "entregado", total: 20000 },
      { status: "cancelado", total: 999999 },
    ];
    expect(calcularTotalPagado(pedidos)).toBe(100000);
  });

  it("retorna 0 si no hay pedidos", () => {
    expect(calcularTotalPagado([])).toBe(0);
  });

  it("retorna 0 si ningun pedido cuenta como pagado", () => {
    expect(
      calcularTotalPagado([{ status: "pendiente", total: 1000 }]),
    ).toBe(0);
  });
});
