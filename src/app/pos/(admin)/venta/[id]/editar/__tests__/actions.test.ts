import { beforeEach, describe, expect, it, vi } from "vitest";

const redirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/admin/require-admin", () => ({ requireAdmin: vi.fn() }));

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ rpc })),
}));

import { actualizarVenta } from "../actions";

const items = [
  {
    productId: "p1",
    variantId: null,
    imageId: null,
    slug: "",
    name: "Camiseta",
    unitPrice: 35000,
    qty: 1,
    imageUrl: null,
    stock: 3,
  },
];

beforeEach(() => {
  redirect.mockClear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: { id: "venta-1" }, error: null });
});

describe("actualizarVenta — destino tras guardar", () => {
  it("por defecto vuelve al recibo de la venta", async () => {
    await actualizarVenta("venta-1", items, "efectivo", 0, "c1");
    expect(redirect).toHaveBeenCalledWith("/pos/venta/venta-1");
  });

  it("con destino 'credito' vuelve al detalle del credito", async () => {
    await actualizarVenta("venta-1", items, "credito", 0, "c1", "credito");
    expect(redirect).toHaveBeenCalledWith("/pos/creditos/venta-1");
  });

  it("si la base rechaza el cambio devuelve el mensaje y no redirige", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "El nuevo total ($30.000) no puede ser menor a lo ya abonado ($40.000)." },
    });

    const resultado = await actualizarVenta("venta-1", items, "credito", 0, "c1", "credito");

    expect(resultado).toEqual({
      error: "El nuevo total ($30.000) no puede ser menor a lo ya abonado ($40.000).",
    });
    expect(redirect).not.toHaveBeenCalled();
  });
});
