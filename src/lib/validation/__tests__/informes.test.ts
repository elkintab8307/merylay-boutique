import { describe, expect, it } from "vitest";
import { rangoFechaSchema } from "../informes";

describe("rangoFechaSchema", () => {
  it("acepta un rango valido", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "2026-01-01", hasta: "2026-01-31" })
        .success,
    ).toBe(true);
  });

  it("acepta un rango de un solo dia", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "2026-01-01", hasta: "2026-01-01" })
        .success,
    ).toBe(true);
  });

  it("rechaza cuando hasta es anterior a desde", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "2026-01-31", hasta: "2026-01-01" })
        .success,
    ).toBe(false);
  });

  it("rechaza una fecha desde malformada", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "31/01/2026", hasta: "2026-01-31" })
        .success,
    ).toBe(false);
  });

  it("rechaza una fecha hasta malformada", () => {
    expect(
      rangoFechaSchema.safeParse({ desde: "2026-01-01", hasta: "not-a-date" })
        .success,
    ).toBe(false);
  });

  it("rechaza cuando falta desde", () => {
    expect(rangoFechaSchema.safeParse({ hasta: "2026-01-31" }).success).toBe(
      false,
    );
  });
});
