// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchCatalogProducts } from "../fetch-catalog";

function crearQueryBuilderMock(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = ["select", "eq", "ilike", "gte", "lte", "order", "in"];
  for (const metodo of chain) {
    builder[metodo] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: { data: unknown[]; error: null }) => void) =>
    resolve({ data, error: null });
  return builder;
}

function crearSupabaseMock(tablas: {
  products?: unknown[];
  product_variants?: unknown[];
  product_images?: unknown[];
  favorites?: unknown[];
}) {
  const builders = {
    products: crearQueryBuilderMock(tablas.products ?? []),
    product_variants: crearQueryBuilderMock(tablas.product_variants ?? []),
    product_images: crearQueryBuilderMock(tablas.product_images ?? []),
    favorites: crearQueryBuilderMock(tablas.favorites ?? []),
  };
  const from = vi.fn((tabla: keyof typeof builders) => builders[tabla]);
  return { from };
}

const SORT_RECIENTES = {
  key: "recientes" as const,
  column: "created_at" as const,
  ascending: false,
};

function producto(id: string) {
  return {
    id,
    name: `Producto ${id}`,
    slug: `producto-${id}`,
    price: 50000,
    promo_price: null,
    stock: 5,
  };
}

describe("fetchCatalogProducts — limit", () => {
  it("sin limit, devuelve todos los productos que trae la consulta", async () => {
    const supabase = crearSupabaseMock({
      products: [producto("1"), producto("2"), producto("3")],
    });

    const resultado = await fetchCatalogProducts(supabase as never, {
      tallas: [],
      colores: [],
      sort: SORT_RECIENTES,
      userId: null,
    });

    expect(resultado.productos).toHaveLength(3);
  });

  it("con limit, recorta al numero indicado respetando el orden de la consulta", async () => {
    const supabase = crearSupabaseMock({
      products: [producto("1"), producto("2"), producto("3"), producto("4")],
    });

    const resultado = await fetchCatalogProducts(supabase as never, {
      tallas: [],
      colores: [],
      sort: SORT_RECIENTES,
      userId: null,
      limit: 2,
    });

    expect(resultado.productos.map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("con limit mayor que el total de productos, devuelve todos sin error", async () => {
    const supabase = crearSupabaseMock({ products: [producto("1")] });

    const resultado = await fetchCatalogProducts(supabase as never, {
      tallas: [],
      colores: [],
      sort: SORT_RECIENTES,
      userId: null,
      limit: 10,
    });

    expect(resultado.productos).toHaveLength(1);
  });
});
