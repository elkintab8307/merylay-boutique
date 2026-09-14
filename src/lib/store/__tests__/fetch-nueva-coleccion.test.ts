// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { fetchNuevaColeccion } from "../fetch-nueva-coleccion";

function crearQueryBuilderMock(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = ["select", "eq", "in", "not"];
  for (const metodo of chain) {
    builder[metodo] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: { data: unknown[]; error: null }) => void) =>
    resolve({ data, error: null });
  return builder;
}

function crearSupabaseMock(tablas: {
  product_variants?: unknown[];
  products?: unknown[];
  product_images?: unknown[];
}) {
  const builders = {
    product_variants: crearQueryBuilderMock(tablas.product_variants ?? []),
    products: crearQueryBuilderMock(tablas.products ?? []),
    product_images: crearQueryBuilderMock(tablas.product_images ?? []),
  };
  const from = vi.fn((tabla: keyof typeof builders) => builders[tabla]);
  return { from };
}

const AHORA_ISO = new Date().toISOString();
function hace(dias: number): string {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

describe("fetchNuevaColeccion", () => {
  it("incluye una variante activa con producto activo y foto propia", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: null, nueva_coleccion_desde: AHORA_ISO },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: true },
      ],
      product_images: [{ variant_id: "v1", url: "https://cdn.test/v1.jpg", sort_order: 0, is_primary: true }],
    });

    const resultado = await fetchNuevaColeccion(supabase as never);

    expect(resultado).toEqual([
      {
        variantId: "v1",
        productSlug: "pijama-1",
        productName: "Pijama 1",
        price: 50000,
        promoPrice: null,
        imageUrl: "https://cdn.test/v1.jpg",
      },
    ]);
  });

  it("excluye variantes cuya fecha ya paso los 5 dias", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: null, nueva_coleccion_desde: hace(8) },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: true },
      ],
      product_images: [{ variant_id: "v1", url: "https://cdn.test/v1.jpg", sort_order: 0, is_primary: true }],
    });

    expect(await fetchNuevaColeccion(supabase as never)).toEqual([]);
  });

  it("excluye variantes sin ninguna foto propia", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: null, nueva_coleccion_desde: AHORA_ISO },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: true },
      ],
      product_images: [],
    });

    expect(await fetchNuevaColeccion(supabase as never)).toEqual([]);
  });

  it("excluye variantes de productos inactivos", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: null, nueva_coleccion_desde: AHORA_ISO },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: false },
      ],
      product_images: [{ variant_id: "v1", url: "https://cdn.test/v1.jpg", sort_order: 0, is_primary: true }],
    });

    expect(await fetchNuevaColeccion(supabase as never)).toEqual([]);
  });

  it("usa price_override cuando existe", async () => {
    const supabase = crearSupabaseMock({
      product_variants: [
        { id: "v1", product_id: "p1", price_override: 42000, nueva_coleccion_desde: AHORA_ISO },
      ],
      products: [
        { id: "p1", slug: "pijama-1", name: "Pijama 1", price: 50000, promo_price: null, is_active: true },
      ],
      product_images: [{ variant_id: "v1", url: "https://cdn.test/v1.jpg", sort_order: 0, is_primary: true }],
    });

    const resultado = await fetchNuevaColeccion(supabase as never);
    expect(resultado[0].price).toBe(42000);
  });

  it("respeta el tope de 12 items", async () => {
    const variantes = Array.from({ length: 15 }, (_, i) => ({
      id: `v${i}`,
      product_id: `p${i}`,
      price_override: null,
      nueva_coleccion_desde: AHORA_ISO,
    }));
    const productos = Array.from({ length: 15 }, (_, i) => ({
      id: `p${i}`,
      slug: `producto-${i}`,
      name: `Producto ${i}`,
      price: 10000,
      promo_price: null,
      is_active: true,
    }));
    const imagenes = Array.from({ length: 15 }, (_, i) => ({
      variant_id: `v${i}`,
      url: `https://cdn.test/${i}.jpg`,
      sort_order: 0,
      is_primary: true,
    }));
    const supabase = crearSupabaseMock({
      product_variants: variantes,
      products: productos,
      product_images: imagenes,
    });

    const resultado = await fetchNuevaColeccion(supabase as never);
    expect(resultado).toHaveLength(12);
  });
});
