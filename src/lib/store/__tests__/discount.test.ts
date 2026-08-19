import { describe, expect, it } from "vitest";
import { calcularDescuento, precioEfectivo } from "../discount";

describe("calcularDescuento", () => {
  it("calcula el porcentaje cuando promoPrice es menor al precio", () => {
    expect(calcularDescuento(100000, 80000)).toBe(20);
  });

  it("redondea al entero mas cercano", () => {
    expect(calcularDescuento(100000, 66667)).toBe(33);
  });

  it("devuelve null si no hay promoPrice", () => {
    expect(calcularDescuento(80000, null)).toBeNull();
  });

  it("devuelve null si promoPrice es cero (promocion desactivada)", () => {
    expect(calcularDescuento(80000, 0)).toBeNull();
  });

  it("devuelve null si promoPrice es igual al precio", () => {
    expect(calcularDescuento(100000, 100000)).toBeNull();
  });

  it("devuelve null si promoPrice es mayor al precio", () => {
    expect(calcularDescuento(90000, 100000)).toBeNull();
  });
});

describe("precioEfectivo", () => {
  it("devuelve promoPrice cuando es una promocion valida", () => {
    expect(precioEfectivo(100000, 80000)).toBe(80000);
  });

  it("devuelve price cuando promoPrice es null", () => {
    expect(precioEfectivo(100000, null)).toBe(100000);
  });

  it("devuelve price cuando promoPrice es cero", () => {
    expect(precioEfectivo(100000, 0)).toBe(100000);
  });

  it("devuelve price cuando promoPrice es mayor o igual al precio", () => {
    expect(precioEfectivo(100000, 100000)).toBe(100000);
    expect(precioEfectivo(90000, 100000)).toBe(90000);
  });
});
