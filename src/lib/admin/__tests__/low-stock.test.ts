import { describe, expect, it } from "vitest";
import { buildLowStockItems } from "../low-stock";

describe("buildLowStockItems", () => {
  it("incluye un producto sin variantes con stock igual o por debajo del umbral", () => {
    const items = buildLowStockItems(
      [{ id: "p1", name: "Pijama Rosa", stock: 2 }],
      [],
      2,
    );
    expect(items).toEqual([
      { productId: "p1", productName: "Pijama Rosa", variantLabel: null, stock: 2 },
    ]);
  });

  it("excluye un producto sin variantes con stock por encima del umbral", () => {
    const items = buildLowStockItems(
      [{ id: "p1", name: "Pijama Rosa", stock: 3 }],
      [],
      2,
    );
    expect(items).toEqual([]);
  });

  it("evalua un producto CON variantes por sus variantes, no por su propio stock", () => {
    const items = buildLowStockItems(
      [{ id: "p1", name: "Pijama Rosa", stock: 0 }],
      [
        { id: "v1", product_id: "p1", talla: "M", color: "Rosa", stock: 1 },
        { id: "v2", product_id: "p1", talla: "L", color: "Rosa", stock: 5 },
      ],
      2,
    );
    expect(items).toEqual([
      { productId: "p1", productName: "Pijama Rosa", variantLabel: "M / Rosa", stock: 1 },
    ]);
  });

  it("arma el variantLabel solo con talla, solo con color, o ambos", () => {
    const items = buildLowStockItems(
      [{ id: "p1", name: "Pijama Rosa", stock: 0 }],
      [{ id: "v1", product_id: "p1", talla: "M", color: null, stock: 0 }],
      2,
    );
    expect(items[0].variantLabel).toBe("M");
  });

  it("ordena los resultados por stock ascendente", () => {
    const items = buildLowStockItems(
      [
        { id: "p1", name: "A", stock: 2 },
        { id: "p2", name: "B", stock: 0 },
      ],
      [],
      2,
    );
    expect(items.map((i) => i.stock)).toEqual([0, 2]);
  });
});
