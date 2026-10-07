import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

function mockCatalogo(productos: unknown[]) {
  const resultado = { data: productos, error: null };
  const query: Record<string, unknown> = {};
  const encadenable = vi.fn(() => query);
  query.eq = encadenable;
  query.ilike = encadenable;
  (query as { then: unknown }).then = (resolve: (v: typeof resultado) => void) => resolve(resultado);
  const select = vi.fn(() => query);
  const supabase = { from: vi.fn(() => ({ select })) };
  return { supabase, select, query };
}

describe("buscarCatalogo", () => {
  it("sin ningun filtro lanza un error claro", async () => {
    const { buscarCatalogo } = await import("./catalog.ts");
    await expect(buscarCatalogo({})).rejects.toThrow(/al menos un filtro/);
  });

  it("con texto, filtra por nombre del producto O nombre de categoria (en memoria, case-insensitive)", async () => {
    const productos = [
      { id: "p1", name: "Pijama Rosa", price: 89900, stock: 5, categories: { name: "Pijamas" }, product_variants: [], product_images: [] },
      { id: "p2", name: "Camiseta Blanca", price: 40000, stock: 3, categories: { name: "Camiseta algodón licrado" }, product_variants: [], product_images: [] },
      { id: "p3", name: "Bata Dorada", price: 120000, stock: 2, categories: { name: "Batas" }, product_variants: [], product_images: [] },
    ];
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "camiseta" });

    expect(resultado).toHaveLength(1);
    expect(resultado[0].nombre).toBe("Camiseta Blanca");
  });

  it("con talla, usa product_variants!inner y filtra por talla", async () => {
    const productos = [
      {
        id: "p1", name: "Pijama Rosa", price: 89900, stock: 5, categories: { name: "Pijamas" },
        product_variants: [{ id: "v1", talla: "M", color: "Rosa", price_override: null, stock: 4 }],
        product_images: [],
      },
    ];
    const { supabase, select } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ talla: "M" });

    expect(select).toHaveBeenCalledWith(expect.stringContaining("product_variants!inner"));
    expect(resultado).toEqual([{
      productId: "p1", variantId: "v1", nombre: "Pijama Rosa", talla: "M", color: "Rosa",
      precio: 89900, stock: 4, imageId: null, fotoUrl: null,
    }]);
  });

  it("devuelve como maximo 50 filas", async () => {
    const productos = Array.from({ length: 60 }, (_, i) => ({
      id: `p${i}`, name: `Camiseta ${i}`, price: 40000, stock: 1,
      categories: { name: "Camisetas" }, product_variants: [], product_images: [],
    }));
    const { supabase } = mockCatalogo(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCatalogo } = await import("./catalog.ts");
    const resultado = await buscarCatalogo({ texto: "camiseta" });

    expect(resultado).toHaveLength(50);
  });
});

describe("obtenerProductoParaCarrito", () => {
  function mockProductoYVariante(producto: unknown, variante: unknown) {
    const eqVariante2 = vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: variante, error: null })) }));
    const eqVariante1 = vi.fn(() => ({ eq: eqVariante2 }));
    const eqProducto2 = vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: producto, error: null })) }));
    const eqProducto1 = vi.fn(() => ({ eq: eqProducto2 }));
    const supabase = {
      from: vi.fn((tabla: string) => ({
        select: vi.fn(() => ({ eq: tabla === "product_variants" ? eqVariante1 : eqProducto1 })),
      })),
    };
    return { supabase, eqVariante1, eqVariante2 };
  }

  const producto = {
    id: "p2", name: "Bata Dorada", price: 120000, stock: 7,
    product_variants: [] as { id: string }[],
    product_images: [{ id: "img-gen", url: "https://x/gen.jpg", is_primary: true, variant_id: null, vendida: false }],
  };

  it("devuelve nombre, precio, stock e imagen reales de la base de datos para una variante del producto", async () => {
    const { supabase, eqVariante1, eqVariante2 } = mockProductoYVariante(producto, {
      id: "v2", name: "Talla M / Rosa", price_override: 130000, stock: 4, product_id: "p2",
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    const resultado = await obtenerProductoParaCarrito("p2", "v2");

    expect(eqVariante1).toHaveBeenCalledWith("id", "v2");
    expect(eqVariante2).toHaveBeenCalledWith("product_id", "p2");
    expect(resultado).toEqual({
      productId: "p2", variantId: "v2", nombre: "Bata Dorada (Talla M / Rosa)", precio: 130000, stock: 4, imageId: null,
    });
  });

  it("devuelve null si la variante no pertenece al producto indicado", async () => {
    const { supabase } = mockProductoYVariante(producto, null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    expect(await obtenerProductoParaCarrito("p2", "v-de-otro-producto")).toBeNull();
  });

  it("devuelve null si el producto no existe o no esta activo", async () => {
    const { supabase } = mockProductoYVariante(null, null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    expect(await obtenerProductoParaCarrito("p-inexistente", null)).toBeNull();
  });

  it("usa el precio y stock del producto base cuando no hay variante", async () => {
    const { supabase } = mockProductoYVariante(producto, null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    expect(await obtenerProductoParaCarrito("p2", null)).toEqual({
      productId: "p2", variantId: null, nombre: "Bata Dorada", precio: 120000, stock: 7, imageId: null,
    });
  });

  it("devuelve null si se pide el producto base sin variante pero el producto si tiene variantes", async () => {
    const { supabase } = mockProductoYVariante({ ...producto, product_variants: [{ id: "v1" }] }, null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { obtenerProductoParaCarrito } = await import("./catalog.ts");
    expect(await obtenerProductoParaCarrito("p2", null)).toBeNull();
  });
});

describe("generarPdfConFotos", () => {
  it("dibuja una fila por producto, con foto cuando la descarga funciona", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([0xff, 0xd8, 0xff]), { status: 200 })));
    const { generarPdfConFotos } = await import("./catalog.ts");

    const bytes = await generarPdfConFotos("Informe de prueba", [
      { fotoUrl: "https://x/foto.jpg", nombre: "Pijama Rosa", detalle: "talla M", precio: 89900, nota: "stock: 5" },
    ]);

    expect(bytes.byteLength).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("si la descarga de una foto falla, esa fila se dibuja sin imagen (no aborta el PDF)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error", { status: 500 })));
    const { generarPdfConFotos } = await import("./catalog.ts");

    const bytes = await generarPdfConFotos("Informe de prueba", [
      { fotoUrl: "https://x/rota.jpg", nombre: "Pijama Rosa", detalle: "talla M", precio: 89900 },
    ]);

    expect(bytes.byteLength).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("una fila sin fotoUrl no intenta descargar nada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generarPdfConFotos } = await import("./catalog.ts");

    await generarPdfConFotos("Informe de prueba", [
      { fotoUrl: null, nombre: "Pijama Rosa", detalle: "talla M", precio: 89900 },
    ]);

    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe("generarCatalogoPdf", () => {
  it("sin filtros, usa el catalogo completo de productos activos y sube el PDF firmado", async () => {
    const order = vi.fn(async () => ({
      data: [{ name: "Pijama Rosa", price: 89900, stock: 5, categories: null, product_variants: [], product_images: [] }],
      error: null,
    }));
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/catalogo-firmado.pdf" }, error: null }));
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) })),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl })) },
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    const url = await generarCatalogoPdf();

    expect(url).toBe("https://x/catalogo-firmado.pdf");
    expect(upload).toHaveBeenCalled();
  });

  it("con filtros, usa buscarCatalogo en vez del catalogo completo", async () => {
    const query: Record<string, unknown> = {};
    query.eq = vi.fn(() => query);
    (query as { then: unknown }).then = (resolve: (v: { data: unknown[]; error: null }) => void) =>
      resolve({ data: [{ id: "p1", name: "Camiseta Azul", price: 40000, stock: 2, categories: { name: "Camisetas" }, product_variants: [], product_images: [] }], error: null });
    const select = vi.fn(() => query);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/catalogo-filtrado.pdf" }, error: null }));
    const supabase = {
      from: vi.fn(() => ({ select })),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl })) },
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    const url = await generarCatalogoPdf({ texto: "camiseta" });

    expect(url).toBe("https://x/catalogo-filtrado.pdf");
    expect(select).toHaveBeenCalled();
  });

  it("lanza un error descriptivo si la consulta de productos falla (sin filtros)", async () => {
    const order = vi.fn(async () => ({ data: null, error: { message: "fallo de red" } }));
    const upload = vi.fn(async () => ({ error: null }));
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) })),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl: vi.fn() })) },
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");
    await expect(generarCatalogoPdf()).rejects.toThrow(/fallo de red/);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("generarCotizacionPdf", () => {
  it("sube un PDF de los items del carrito (sin fotos, ItemCarrito no trae fotoUrl) y devuelve una URL firmada", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/firmado.pdf" }, error: null }));
    const supabase = { storage: { from: vi.fn(() => ({ upload, createSignedUrl })) } };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCotizacionPdf } = await import("./catalog.ts");
    const url = await generarCotizacionPdf([
      { productId: "p1", variantId: null, imageId: null, qty: 2, unitPrice: 50000, nameSnapshot: "Pijama Rosa" },
    ]);

    expect(url).toBe("https://x/firmado.pdf");
    expect(upload).toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled(); // sin fotoUrl, generarPdfConFotos no intenta descargar nada
    vi.unstubAllGlobals();
  });
});
