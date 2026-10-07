import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

function mockBusqueda(productos: unknown[]) {
  const limit = vi.fn(async () => ({ data: productos, error: null }));
  const ilike = vi.fn(() => ({ limit }));
  const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ ilike })) })) })) };
  return { supabase, ilike };
}

describe("buscarProductos", () => {
  it("devuelve una fila por producto sin variantes, con ids y su foto principal", async () => {
    const productos = [
      {
        id: "p1", name: "Pijama Rosa", price: 89900, stock: 5,
        product_variants: [],
        product_images: [{ id: "img-1", url: "https://x/img1.jpg", is_primary: true, variant_id: null, vendida: false }],
      },
    ];
    const { supabase } = mockBusqueda(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarProductos } = await import("./catalog.ts");
    const resultado = await buscarProductos("pijama");

    expect(resultado).toEqual([
      {
        productId: "p1", variantId: null, nombre: "Pijama Rosa", talla: null, color: null,
        precio: 89900, stock: 5, imageId: "img-1", fotoUrl: "https://x/img1.jpg",
      },
    ]);
  });

  it("devuelve una fila por variante, con su talla/color/precio/stock y la foto de esa variante", async () => {
    const productos = [
      {
        id: "p2", name: "Bata Dorada", price: 120000, stock: 7,
        product_variants: [
          { id: "v1", talla: "S", color: "Rosa", price_override: null, stock: 3 },
          { id: "v2", talla: "M", color: "Rosa", price_override: 130000, stock: 4 },
        ],
        product_images: [
          { id: "img-gen", url: "https://x/gen.jpg", is_primary: true, variant_id: null, vendida: false },
          { id: "img-v2", url: "https://x/v2.jpg", is_primary: false, variant_id: "v2", vendida: false },
        ],
      },
    ];
    const { supabase } = mockBusqueda(productos);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarProductos } = await import("./catalog.ts");
    const resultado = await buscarProductos("bata");

    expect(resultado).toEqual([
      {
        productId: "p2", variantId: "v1", nombre: "Bata Dorada", talla: "S", color: "Rosa",
        precio: 120000, stock: 3, imageId: "img-gen", fotoUrl: "https://x/gen.jpg",
      },
      {
        productId: "p2", variantId: "v2", nombre: "Bata Dorada", talla: "M", color: "Rosa",
        precio: 130000, stock: 4, imageId: "img-v2", fotoUrl: "https://x/v2.jpg",
      },
    ]);
  });

  it("escapa los comodines % y _ de la busqueda antes de armar el patron ilike", async () => {
    const { supabase, ilike } = mockBusqueda([]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarProductos } = await import("./catalog.ts");
    await buscarProductos("50%_off");

    expect(ilike).toHaveBeenCalledWith("name", "%50\\%\\_off%");
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
      productId: "p2", variantId: "v2", nombre: "Bata Dorada (Talla M / Rosa)", precio: 130000, stock: 4, imageId: "img-gen",
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
      productId: "p2", variantId: null, nombre: "Bata Dorada", precio: 120000, stock: 7, imageId: "img-gen",
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

describe("generarCatalogoPdf", () => {
  it("sube un PDF al bucket whatsapp-docs y devuelve una URL firmada", async () => {
    const productos = [
      { name: "Pijama Rosa", price: 89900, stock: 5 },
      { name: "Bata Dorada", price: 120000, stock: 2 },
    ];
    const order = vi.fn(async () => ({ data: productos, error: null }));
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
    expect(createSignedUrl).toHaveBeenCalledWith(expect.stringContaining(".pdf"), 600);
  });

  it("lanza un error descriptivo si la consulta de productos falla", async () => {
    const order = vi.fn(async () => ({ data: null, error: { message: "fallo de red" } }));
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({ data: { signedUrl: "https://x/no-deberia-llegar.pdf" }, error: null }));
    const supabase = {
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ order })) })) })),
      storage: { from: vi.fn(() => ({ upload, createSignedUrl })) },
    };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { generarCatalogoPdf } = await import("./catalog.ts");

    await expect(generarCatalogoPdf()).rejects.toThrow(/fallo de red/);
    expect(upload).not.toHaveBeenCalled();
  });
});

describe("generarCotizacionPdf", () => {
  it("sube un PDF al bucket whatsapp-docs y devuelve una URL firmada", async () => {
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
    expect(createSignedUrl).toHaveBeenCalledWith(expect.stringContaining(".pdf"), 600);
  });
});
