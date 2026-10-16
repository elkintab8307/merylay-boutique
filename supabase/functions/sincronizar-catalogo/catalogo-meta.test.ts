import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

function mockSupabaseProductos(productos: unknown[]): SupabaseClient {
  return {
    from: vi.fn(() => {
      const query: Record<string, unknown> = {};
      for (const metodo of ["select", "eq"]) {
        query[metodo] = vi.fn(() => query);
      }
      (query as { then: unknown }).then = (resolve: (v: { data: unknown; error: null }) => void) =>
        resolve({ data: productos, error: null });
      return query;
    }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("Deno", {
    env: {
      get: vi.fn((k: string) =>
        ({
          SITE_URL: "https://merylay.shop",
          META_CATALOG_ACCESS_TOKEN: "token-catalogo",
          META_CATALOG_ID: "1814749529881284",
        } as Record<string, string>)[k]),
    },
  });
});

describe("construirItemsCatalogo", () => {
  it("producto sin variantes: un item con su propia foto principal, precio y link al detalle", async () => {
    const { construirItemsCatalogo } = await import("./catalogo-meta.ts");
    const supabase = mockSupabaseProductos([
      {
        id: "p1",
        name: "Pijama Rosa",
        description: "Pijama suave de algodón",
        slug: "pijama-rosa",
        sku: "SKU-P1",
        price: 89900,
        stock: 5,
        product_variants: [],
        product_images: [
          { id: "img1", url: "https://x/pijama.jpg", is_primary: true, variant_id: null, vendida: false },
        ],
      },
    ]);

        const items = await construirItemsCatalogo(supabase);

    expect(items).toEqual([
      {
        method: "UPDATE",
        data: {
          id: "SKU-P1",
          title: "Pijama Rosa",
          description: "Pijama suave de algodón",
          availability: "in stock",
          condition: "new",
          price: "89900 COP",
          link: "https://merylay.shop/producto/pijama-rosa",
          image_link: "https://x/pijama.jpg",
          brand: "MeryLay Boutique",
        },
      },
    ]);
  });

  it("producto con variantes: un item por variante, usando el sku y stock/precio de CADA variante", async () => {
    const { construirItemsCatalogo } = await import("./catalogo-meta.ts");
    const supabase = mockSupabaseProductos([
      {
        id: "p2",
        name: "Camiseta Mariposa",
        description: "Camiseta estampada",
        slug: "camiseta-mariposa",
        sku: "SKU-P2",
        price: 45000,
        stock: 0,
        product_variants: [
          { id: "v1", sku: "SKU-P2-S", talla: "S", color: null, price_override: null, stock: 3 },
          { id: "v2", sku: "SKU-P2-M", talla: "M", color: null, price_override: 48000, stock: 0 },
        ],
        product_images: [
          { id: "img1", url: "https://x/general.jpg", is_primary: true, variant_id: null, vendida: false },
          { id: "img2", url: "https://x/talla-s.jpg", is_primary: true, variant_id: "v1", vendida: false },
        ],
      },
    ]);

        const items = await construirItemsCatalogo(supabase);

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      method: "UPDATE",
      data: {
        id: "SKU-P2-S",
        title: "Camiseta Mariposa (S)",
        description: "Camiseta estampada",
        availability: "in stock",
        condition: "new",
        price: "45000 COP",
        link: "https://merylay.shop/producto/camiseta-mariposa",
        image_link: "https://x/talla-s.jpg",
        brand: "MeryLay Boutique",
      },
    });
    expect(items[1]).toEqual({
      method: "UPDATE",
      data: {
        id: "SKU-P2-M",
        title: "Camiseta Mariposa (M)",
        description: "Camiseta estampada",
        availability: "out of stock",
        condition: "new",
        price: "48000 COP",
        link: "https://merylay.shop/producto/camiseta-mariposa",
        image_link: "https://x/general.jpg",
        brand: "MeryLay Boutique",
      },
    });
  });

  it("sin ninguna foto disponible, el item se omite (Meta rechaza items sin image_link)", async () => {
    const { construirItemsCatalogo } = await import("./catalogo-meta.ts");
    const supabase = mockSupabaseProductos([
      {
        id: "p3",
        name: "Producto sin foto",
        description: null,
        slug: "producto-sin-foto",
        sku: "SKU-P3",
        price: 10000,
        stock: 1,
        product_variants: [],
        product_images: [],
      },
    ]);

        const items = await construirItemsCatalogo(supabase);

    expect(items).toEqual([]);
  });
});

describe("enviarItemsBatch", () => {
  it("manda los items al endpoint items_batch del catalogo con el token y el item_type correctos", async () => {
    fetchMock.mockResolvedValue({ ok: true, text: async () => "{}" });
    const { enviarItemsBatch } = await import("./catalogo-meta.ts");

    const resultado = await enviarItemsBatch([
      { method: "UPDATE", data: { id: "SKU-1", title: "X", description: "", availability: "in stock", condition: "new", price: "1 COP", link: "", image_link: "", brand: "" } },
    ]);

    expect(resultado).toEqual({ enviados: 1, errores: [] });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/1814749529881284/items_batch",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-catalogo" }),
      }),
    );
    const cuerpo = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(cuerpo.item_type).toBe("PRODUCT_ITEM");
    expect(cuerpo.requests).toHaveLength(1);
  });

  it("si la Graph API responde con error, lo reporta en errores sin lanzar", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "mensaje de error" });
    const { enviarItemsBatch } = await import("./catalogo-meta.ts");

    const resultado = await enviarItemsBatch([
      { method: "UPDATE", data: { id: "SKU-1", title: "X", description: "", availability: "in stock", condition: "new", price: "1 COP", link: "", image_link: "", brand: "" } },
    ]);

    expect(resultado.enviados).toBe(0);
    expect(resultado.errores[0]).toContain("400");
    expect(resultado.errores[0]).toContain("mensaje de error");
  });

  it("lista vacia: no llama a fetch", async () => {
    const { enviarItemsBatch } = await import("./catalogo-meta.ts");
    const resultado = await enviarItemsBatch([]);
    expect(resultado).toEqual({ enviados: 0, errores: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
