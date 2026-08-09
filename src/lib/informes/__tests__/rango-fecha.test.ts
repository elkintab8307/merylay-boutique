import { describe, expect, it } from "vitest";
import {
  rangoEsteAnio,
  rangoEstaSemana,
  rangoHoy,
  rangoMesActual,
  resolverRango,
} from "../rango-fecha";

describe("rangoHoy", () => {
  it("usa la fecha calendario de Bogota, no la de UTC", () => {
    // 2026-08-16T00:30:00Z son las 2026-08-15 19:30 en Bogota (UTC-5)
    const hoy = new Date("2026-08-16T00:30:00Z");
    expect(rangoHoy(hoy)).toEqual({ desde: "2026-08-15", hasta: "2026-08-15" });
  });

  it("cruza al dia siguiente solo cuando ya es ese dia en Bogota", () => {
    // 2026-08-16T05:30:00Z son las 2026-08-16 00:30 en Bogota
    const hoy = new Date("2026-08-16T05:30:00Z");
    expect(rangoHoy(hoy)).toEqual({ desde: "2026-08-16", hasta: "2026-08-16" });
  });
});

describe("rangoMesActual", () => {
  it("devuelve del dia 1 del mes hasta la fecha dada, en hora de Bogota", () => {
    const hoy = new Date("2026-08-15T15:00:00Z");
    expect(rangoMesActual(hoy)).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-15",
    });
  });

  it("no salta al mes siguiente cuando UTC ya cruzo pero Bogota no", () => {
    // 2026-09-01T02:00:00Z son las 2026-08-31 21:00 en Bogota (sigue en agosto)
    const hoy = new Date("2026-09-01T02:00:00Z");
    expect(rangoMesActual(hoy)).toEqual({
      desde: "2026-08-01",
      hasta: "2026-08-31",
    });
  });
});

describe("rangoEstaSemana", () => {
  it("devuelve desde el lunes de esta semana hasta la fecha dada", () => {
    const sabado = new Date("2026-08-15T15:00:00Z");
    expect(rangoEstaSemana(sabado)).toEqual({
      desde: "2026-08-10",
      hasta: "2026-08-15",
    });
  });

  it("cuando la fecha dada es domingo, retrocede al lunes anterior", () => {
    const domingo = new Date("2026-08-16T15:00:00Z");
    expect(rangoEstaSemana(domingo)).toEqual({
      desde: "2026-08-10",
      hasta: "2026-08-16",
    });
  });
});

describe("rangoEsteAnio", () => {
  it("devuelve desde el 1 de enero hasta la fecha dada", () => {
    const hoy = new Date("2026-08-15T15:00:00Z");
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
