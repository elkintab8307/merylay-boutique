import { describe, expect, it } from "vitest";
import { calcularDescuento } from "../discount";

describe("calcularDescuento", () => {
  it("calcula el porcentaje cuando compareAtPrice es mayor al precio", () => {
    expect(calcularDescuento(80000, 100000)).toBe(20);
  });

  it("redondea al entero mas cercano", () => {
    expect(calcularDescuento(66667, 100000)).toBe(33);
  });

  it("devuelve null si no hay compareAtPrice", () => {
    expect(calcularDescuento(80000, null)).toBeNull();
  });

  it("devuelve null si compareAtPrice es igual al precio", () => {
    expect(calcularDescuento(100000, 100000)).toBeNull();
  });

  it("devuelve null si compareAtPrice es menor al precio", () => {
    expect(calcularDescuento(100000, 90000)).toBeNull();
  });
});
