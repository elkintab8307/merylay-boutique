import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("buscarProductos", () => {
  it("devuelve productos activos que coinciden con la busqueda, con su foto principal", async () => {
    const productos = [
      { id: "p1", name: "Pijama Rosa", price: 89900, stock: 5, product_images: [{ url: "https://x/img1.jpg", is_primary: true }] },
    ];
    const ilike = vi.fn(() => ({ limit: vi.fn(async () => ({ data: productos, error: null })) }));
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ ilike })) })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarProductos } = await import("./catalog.ts");
    const resultado = await buscarProductos("pijama");

    expect(resultado).toEqual([
      { id: "p1", nombre: "Pijama Rosa", precio: 89900, stock: 5, fotoUrl: "https://x/img1.jpg" },
    ]);
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
