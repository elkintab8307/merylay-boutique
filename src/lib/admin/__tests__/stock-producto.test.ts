import { describe, expect, it } from "vitest";
import { debeGuardarStockManual } from "../stock-producto";

describe("debeGuardarStockManual", () => {
  it("es true cuando el producto no tiene variantes (stock manual)", () => {
    expect(debeGuardarStockManual(0)).toBe(true);
  });

  it("es false cuando el producto tiene variantes (lo calcula el trigger)", () => {
    expect(debeGuardarStockManual(1)).toBe(false);
    expect(debeGuardarStockManual(5)).toBe(false);
  });
});
