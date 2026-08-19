import { describe, expect, it } from "vitest";
import { calcularEstadoCredito } from "../estado-credito";

describe("calcularEstadoCredito", () => {
  it("es 'pagado' cuando el saldo es 0, sin importar las cuotas", () => {
    const estado = calcularEstadoCredito(0, [{ status: "pendiente", dueDate: "2020-01-01" }], "2026-01-01");
    expect(estado).toBe("pagado");
  });

  it("es 'pagado' cuando el saldo es negativo (defensivo)", () => {
    expect(calcularEstadoCredito(-1, [], "2026-01-01")).toBe("pagado");
  });

  it("es 'vencido' cuando hay saldo y una cuota no pagada con fecha pasada", () => {
    const estado = calcularEstadoCredito(
      50000,
      [{ status: "parcial", dueDate: "2026-01-01" }],
      "2026-02-01",
    );
    expect(estado).toBe("vencido");
  });

  it("no es 'vencido' si la cuota vencida ya esta pagada", () => {
    const estado = calcularEstadoCredito(
      50000,
      [{ status: "pagada", dueDate: "2026-01-01" }],
      "2026-02-01",
    );
    expect(estado).toBe("al_dia");
  });

  it("no es 'vencido' cuando la fecha de vencimiento es hoy mismo (solo estrictamente pasada cuenta)", () => {
    const estado = calcularEstadoCredito(
      50000,
      [{ status: "pendiente", dueDate: "2026-02-01" }],
      "2026-02-01",
    );
    expect(estado).toBe("al_dia");
  });

  it("es 'al_dia' cuando hay saldo pero ninguna cuota vencida", () => {
    const estado = calcularEstadoCredito(
      50000,
      [{ status: "pendiente", dueDate: "2026-03-01" }],
      "2026-02-01",
    );
    expect(estado).toBe("al_dia");
  });
});
