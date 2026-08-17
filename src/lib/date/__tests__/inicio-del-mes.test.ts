import { describe, expect, it } from "vitest";
import { inicioDelMesBogota } from "../inicio-del-mes";

describe("inicioDelMesBogota", () => {
  it("devuelve el dia 1 del mes en curso, medianoche hora de Bogota", () => {
    const fecha = new Date("2026-08-17T15:30:00Z");
    expect(inicioDelMesBogota(fecha)).toBe("2026-08-01T00:00:00-05:00");
  });

  it("funciona en el primer dia del mes", () => {
    const fecha = new Date("2026-03-01T10:00:00Z");
    expect(inicioDelMesBogota(fecha)).toBe("2026-03-01T00:00:00-05:00");
  });

  it("funciona en el ultimo dia del mes", () => {
    const fecha = new Date("2026-02-28T23:59:00Z");
    expect(inicioDelMesBogota(fecha)).toBe("2026-02-01T00:00:00-05:00");
  });
});
