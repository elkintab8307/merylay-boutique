import { describe, expect, it } from "vitest";
import { parseCatalogSearchParams } from "../catalog-search-params";

describe("parseCatalogSearchParams", () => {
  it("usa valores por defecto sin parametros", () => {
    expect(parseCatalogSearchParams({})).toEqual({
      tallas: [],
      colores: [],
      minPrice: undefined,
      maxPrice: undefined,
      sort: { key: "destacados", column: "is_featured", ascending: false },
      q: "",
    });
  });

  it("convierte un solo valor de talla/color en array", () => {
    const result = parseCatalogSearchParams({ talla: "M", color: "Rosa" });
    expect(result.tallas).toEqual(["M"]);
    expect(result.colores).toEqual(["Rosa"]);
  });

  it("preserva multiples valores de talla/color", () => {
    const result = parseCatalogSearchParams({
      talla: ["M", "L"],
      color: ["Rosa", "Dorado"],
    });
    expect(result.tallas).toEqual(["M", "L"]);
    expect(result.colores).toEqual(["Rosa", "Dorado"]);
  });

  it("parsea precios validos", () => {
    const result = parseCatalogSearchParams({ minPrice: "10000", maxPrice: "50000" });
    expect(result.minPrice).toBe(10000);
    expect(result.maxPrice).toBe(50000);
  });

  it("descarta precios invalidos", () => {
    const result = parseCatalogSearchParams({ minPrice: "abc" });
    expect(result.minPrice).toBeUndefined();
  });

  it("recorta espacios en el texto de busqueda", () => {
    expect(parseCatalogSearchParams({ q: "  pijama  " }).q).toBe("pijama");
  });

  it("usa string vacio si no hay texto de busqueda", () => {
    expect(parseCatalogSearchParams({}).q).toBe("");
  });

  it("resuelve el orden via resolveSort", () => {
    expect(parseCatalogSearchParams({ sort: "precio-asc" }).sort).toEqual({
      key: "precio-asc",
      column: "price",
      ascending: true,
    });
  });
});
