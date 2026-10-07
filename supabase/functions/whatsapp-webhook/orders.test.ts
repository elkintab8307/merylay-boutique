import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("crearPedidoWompiDesdeCarrito", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        WOMPI_PUBLIC_KEY: "pub_test_123",
        WOMPI_INTEGRITY_SECRET: "integridad-de-prueba",
        SITE_URL: "https://merylayboutique.com",
      } as Record<string, string>)[key]) },
    });
  });

  it("llama al RPC, calcula la firma y devuelve un link al checkout de WhatsApp", async () => {
    const rpc = vi.fn(async () => ({
      data: { id: "pedido-1", order_number: "ML-20261006-abc123", total: 100000 },
      error: null,
    }));
    const supabase = { rpc };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { crearPedidoWompiDesdeCarrito } = await import("./orders.ts");
    const resultado = await crearPedidoWompiDesdeCarrito(
      "perfil-1",
      [{ productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 100000, nameSnapshot: "Pijama Rosa" }],
      { fullName: "Prueba", phone: "573001234567", address: "Calle 1", city: "Bogota" },
    );

    expect(rpc).toHaveBeenCalledWith("crear_pedido_wompi_whatsapp", {
      p_user_id: "perfil-1",
      p_items: [{ product_id: "p1", variant_id: null, image_id: null, qty: 1 }],
      p_shipping_address: { fullName: "Prueba", phone: "573001234567", address: "Calle 1", city: "Bogota" },
    });
    expect(resultado.orderNumber).toBe("ML-20261006-abc123");
    expect(resultado.linkPago).toContain("https://merylayboutique.com/checkout/wompi/whatsapp/pedido-1");
    expect(resultado.linkPago).toContain("sig=");
  });

  it("lanza un error claro si no hay stock suficiente", async () => {
    const supabase = { rpc: vi.fn(async () => ({ data: null, error: { message: "No hay stock suficiente para uno de los productos del pedido." } })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { crearPedidoWompiDesdeCarrito } = await import("./orders.ts");
    await expect(
      crearPedidoWompiDesdeCarrito("perfil-1", [{ productId: "p1", variantId: null, imageId: null, qty: 99, unitPrice: 100000, nameSnapshot: "Pijama Rosa" }], {}),
    ).rejects.toThrow(/stock suficiente/);
  });
});
