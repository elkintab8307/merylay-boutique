import { describe, expect, it } from "vitest";
import { motivoARemedio } from "../motivo-remedio";

describe("motivoARemedio", () => {
  it("traduce un fallo de red a una causa y un que-hacer claros", () => {
    const r = motivoARemedio("Failed to fetch");
    expect(r.causa).toMatch(/conexión/i);
    expect(r.queHacer).toMatch(/señal|wifi|internet/i);
  });

  it("traduce un fallo al preparar la imagen (memoria) a un consejo util", () => {
    const r = motivoARemedio("No se pudo procesar la imagen");
    expect(r.causa).toMatch(/memoria|preparar/i);
    expect(r.queHacer).toMatch(/sola|de a pocas|captura de pantalla/i);
  });

  it("traduce un rechazo por tamano del servidor", () => {
    const r = motivoARemedio("The object exceeded the maximum allowed size");
    expect(r.causa).toMatch(/tamaño/i);
    expect(r.queHacer).toMatch(/liviana|más pequeña|captura de pantalla/i);
  });

  it("traduce un problema de permisos/sesion", () => {
    const r = motivoARemedio("new row violates row-level security policy");
    expect(r.causa).toMatch(/permiso|sesión/i);
    expect(r.queHacer).toMatch(/sesión|entrar/i);
  });

  it("para un motivo desconocido muestra el texto crudo y un consejo generico", () => {
    const r = motivoARemedio("error 500 raro");
    expect(r.causa).toContain("error 500 raro");
    expect(r.queHacer).toMatch(/reintentar|sola/i);
  });
});
