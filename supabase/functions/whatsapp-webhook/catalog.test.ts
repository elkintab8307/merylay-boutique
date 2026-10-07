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
