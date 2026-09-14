import { describe, expect, it } from "vitest";
import {
  DURACION_NUEVA_COLECCION_DIAS,
  esNuevaColeccionActiva,
  diasDesdeExpiracion,
  resolverNuevaColeccionDesde,
} from "../nueva-coleccion";

const AHORA = new Date("2026-09-14T12:00:00.000Z");
const MS_POR_DIA = 24 * 60 * 60 * 1000;

function hace(dias: number): string {
  return new Date(AHORA.getTime() - dias * MS_POR_DIA).toISOString();
}

describe("DURACION_NUEVA_COLECCION_DIAS", () => {
  it("es 5", () => {
    expect(DURACION_NUEVA_COLECCION_DIAS).toBe(5);
  });
});

describe("esNuevaColeccionActiva", () => {
  it("es false si nunca se activo (null)", () => {
    expect(esNuevaColeccionActiva(null, AHORA)).toBe(false);
  });

  it("es true recien activada", () => {
    expect(esNuevaColeccionActiva(AHORA.toISOString(), AHORA)).toBe(true);
  });

  it("es true justo antes de cumplir 5 dias", () => {
    const desde = new Date(AHORA.getTime() - 5 * MS_POR_DIA + 1000).toISOString();
    expect(esNuevaColeccionActiva(desde, AHORA)).toBe(true);
  });

  it("es false justo despues de cumplir 5 dias", () => {
    const desde = new Date(AHORA.getTime() - 5 * MS_POR_DIA - 1000).toISOString();
    expect(esNuevaColeccionActiva(desde, AHORA)).toBe(false);
  });
});

describe("diasDesdeExpiracion", () => {
  it("es null si nunca se activo", () => {
    expect(diasDesdeExpiracion(null, AHORA)).toBeNull();
  });

  it("es null si sigue activa", () => {
    expect(diasDesdeExpiracion(hace(1), AHORA)).toBeNull();
  });

  it("calcula los dias completos desde que expiro", () => {
    // activada hace 8 dias -> expiro hace 3 dias (8 - 5)
    expect(diasDesdeExpiracion(hace(8), AHORA)).toBe(3);
  });

  it("es 0 el mismo dia en que expira", () => {
    const desde = new Date(AHORA.getTime() - 5 * MS_POR_DIA - 1000).toISOString();
    expect(diasDesdeExpiracion(desde, AHORA)).toBe(0);
  });
});

describe("resolverNuevaColeccionDesde", () => {
  it("activar algo apagado guarda la fecha actual", () => {
    expect(resolverNuevaColeccionDesde(null, true, AHORA)).toBe(AHORA.toISOString());
  });

  it("activar algo que ya estaba expirado reinicia el contador", () => {
    expect(resolverNuevaColeccionDesde(hace(8), true, AHORA)).toBe(AHORA.toISOString());
  });

  it("desactivar algo activo pone null", () => {
    expect(resolverNuevaColeccionDesde(hace(1), false, AHORA)).toBeNull();
  });

  it("dejar activo sin tocar conserva la fecha original", () => {
    const original = hace(1);
    expect(resolverNuevaColeccionDesde(original, true, AHORA)).toBe(original);
  });

  it("dejar apagado/expirado sin tocar conserva la fecha original", () => {
    const original = hace(8);
    expect(resolverNuevaColeccionDesde(original, false, AHORA)).toBe(original);
  });

  it("dejar sin tocar algo que nunca se activo sigue en null", () => {
    expect(resolverNuevaColeccionDesde(null, false, AHORA)).toBeNull();
  });
});
