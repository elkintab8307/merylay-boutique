import { describe, expect, it } from "vitest";
import { inicioDelDiaBogota } from "../inicio-del-dia";

describe("inicioDelDiaBogota", () => {
  it("devuelve medianoche de Bogota (UTC-5) para una hora de la tarde UTC del mismo dia", () => {
    // 2026-08-07T23:30:00Z = 2026-08-07T18:30:00-05:00 (mismo dia en Bogota)
    const resultado = inicioDelDiaBogota(new Date("2026-08-07T23:30:00Z"));
    expect(resultado).toBe("2026-08-07T00:00:00-05:00");
  });

  it("no cruza al dia siguiente cuando UTC ya cruzo pero Bogota no", () => {
    // 2026-08-08T03:30:00Z = 2026-08-07T22:30:00-05:00 (aun 7 de agosto en Bogota)
    const resultado = inicioDelDiaBogota(new Date("2026-08-08T03:30:00Z"));
    expect(resultado).toBe("2026-08-07T00:00:00-05:00");
  });

  it("cruza al dia siguiente cuando ya es de madrugada en Bogota", () => {
    // 2026-08-08T06:00:00Z = 2026-08-08T01:00:00-05:00 (ya 8 de agosto en Bogota)
    const resultado = inicioDelDiaBogota(new Date("2026-08-08T06:00:00Z"));
    expect(resultado).toBe("2026-08-08T00:00:00-05:00");
  });
});
