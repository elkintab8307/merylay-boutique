import { describe, expect, it } from "vitest";
import {
  rangoEsteAnio,
  rangoEstaSemana,
  rangoHoy,
  rangoMesActual,
  resolverRango,
} from "../rango-fecha";

describe("rangoHoy", () => {
  it("devuelve el mismo dia como desde y hasta", () => {
    const hoy = new Date(Date.UTC(2026, 7, 15));
    expect(rangoHoy(hoy)).toEqual({ desde: "2026-08-15", hasta: "2026-08-15" });
  });
});

describe("rangoMesActual", () => {
  it("devuelve del dia 1 del mes hasta la fecha dada", () => {
    const hoy = new Date(Date.UTC(2026, 7, 15));
    expect(rangoMesActual(hoy)).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-15",
    });
  });
});

describe("rangoEstaSemana", () => {
  it("devuelve desde el lunes de esta semana hasta la fecha dada", () => {
    const sabado = new Date(Date.UTC(2026, 7, 15));
    expect(rangoEstaSemana(sabado)).toEqual({
      desde: "2026-08-10",
      hasta: "2026-08-15",
    });
  });

  it("cuando la fecha dada es domingo, retrocede al lunes anterior", () => {
    const domingo = new Date(Date.UTC(2026, 7, 16));
    expect(rangoEstaSemana(domingo)).toEqual({
      desde: "2026-08-10",
      hasta: "2026-08-16",
    });
  });
});

describe("rangoEsteAnio", () => {
  it("devuelve desde el 1 de enero hasta la fecha dada", () => {
    const hoy = new Date(Date.UTC(2026, 7, 15));
    expect(rangoEsteAnio(hoy)).toEqual({
      desde: "2026-01-01",
      hasta: "2026-08-15",
    });
  });
});

describe("resolverRango", () => {
  it("usa el rango recibido cuando es valido", () => {
    expect(
      resolverRango({ desde: "2026-01-01", hasta: "2026-01-31" }),
    ).toEqual({ desde: "2026-01-01", hasta: "2026-01-31" });
  });

  it("cae al mes actual cuando faltan los parametros", () => {
    const resultado = resolverRango({});
    expect(resultado.desde).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("cae al mes actual cuando hasta es anterior a desde", () => {
    const resultado = resolverRango({
      desde: "2026-02-01",
      hasta: "2026-01-01",
    });
    expect(resultado.desde).toMatch(/^\d{4}-\d{2}-01$/);
  });

  it("cae al mes actual cuando las fechas estan malformadas", () => {
    const resultado = resolverRango({
      desde: "no-es-fecha",
      hasta: "2026-01-31",
    });
    expect(resultado.desde).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
