import { describe, expect, it } from "vitest";
import { productoAgotado } from "../stock";

describe("productoAgotado", () => {
  it("sin variantes: agotado cuando el stock del producto es 0", () => {
    expect(productoAgotado(0, [])).toBe(true);
  });

  it("sin variantes: no agotado cuando el stock del producto es mayor a 0", () => {
    expect(productoAgotado(5, [])).toBe(false);
  });

  it("con variantes: agotado solo cuando TODAS las variantes tienen stock 0", () => {
    expect(productoAgotado(0, [0, 0, 0])).toBe(true);
  });

  it("con variantes: no agotado si al menos una variante tiene stock", () => {
    expect(productoAgotado(0, [0, 3, 0])).toBe(false);
  });

  it("con variantes: ignora el stock del producto (no confiable una vez hay variantes)", () => {
    expect(productoAgotado(99, [0, 0])).toBe(true);
  });
});
