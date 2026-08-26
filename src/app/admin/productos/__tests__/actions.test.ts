// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/lib/admin/require-admin", () => ({
  requireAdmin: vi.fn(() => Promise.resolve({ profile: { role: "admin" } })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

function crearQueryBuilderMock(data: unknown[]) {
  const builder: Record<string, unknown> = {};
  const chain = ["select", "eq", "limit"];
  for (const metodo of chain) {
    builder[metodo] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: { data: unknown[]; error: null }) => void) =>
    resolve({ data, error: null });
  return builder;
}

function crearSupabaseMock(tablas: {
  order_items?: unknown[];
  pos_sale_items?: unknown[];
  purchase_items?: unknown[];
  cart_items?: unknown[];
}) {
  const deleteEq = vi.fn(() => Promise.resolve({ error: null }));
  const deleteBuilder = { eq: deleteEq };
  const builders: Record<string, unknown> = {
    order_items: crearQueryBuilderMock(tablas.order_items ?? []),
    pos_sale_items: crearQueryBuilderMock(tablas.pos_sale_items ?? []),
    purchase_items: crearQueryBuilderMock(tablas.purchase_items ?? []),
    cart_items: crearQueryBuilderMock(tablas.cart_items ?? []),
    products: { delete: vi.fn(() => deleteBuilder) },
  };
  const from = vi.fn((tabla: string) => builders[tabla]);
  return { from, builders, _spies: { deleteEq } };
}

describe("eliminarProducto", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("elimina el producto si no tiene ventas, compras ni esta en ningun carrito", async () => {
    const supabase = crearSupabaseMock({});
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { eliminarProducto } = await import("../actions");
    const resultado = await eliminarProducto("prod-1");

    expect(resultado).toEqual({});
    expect(supabase._spies.deleteEq).toHaveBeenCalledWith("id", "prod-1");
  });

  it("rechaza eliminar si el producto tiene ventas de tienda (order_items) y no borra nada", async () => {
    const supabase = crearSupabaseMock({ order_items: [{ id: "oi-1" }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { eliminarProducto } = await import("../actions");
    const resultado = await eliminarProducto("prod-1");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase._spies.deleteEq).not.toHaveBeenCalled();
  });

  it("rechaza eliminar si el producto tiene ventas del POS (pos_sale_items) y no borra nada", async () => {
    const supabase = crearSupabaseMock({ pos_sale_items: [{ id: "psi-1" }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { eliminarProducto } = await import("../actions");
    const resultado = await eliminarProducto("prod-1");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase._spies.deleteEq).not.toHaveBeenCalled();
  });

  it("rechaza eliminar si el producto tiene compras registradas y no borra nada", async () => {
    const supabase = crearSupabaseMock({ purchase_items: [{ id: "pi-1" }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { eliminarProducto } = await import("../actions");
    const resultado = await eliminarProducto("prod-1");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase._spies.deleteEq).not.toHaveBeenCalled();
  });

  it("rechaza eliminar si el producto esta en el carrito de un cliente y no borra nada", async () => {
    const supabase = crearSupabaseMock({ cart_items: [{ id: "ci-1" }] });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { eliminarProducto } = await import("../actions");
    const resultado = await eliminarProducto("prod-1");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase._spies.deleteEq).not.toHaveBeenCalled();
  });
});

describe("toggleImagenVendida", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("actualiza product_images.vendida y no falla si todo sale bien", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update })) };
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { toggleImagenVendida } = await import("../actions");
    const resultado = await toggleImagenVendida("img-1", true, "prod-1");

    expect(resultado).toEqual({});
    expect(supabase.from).toHaveBeenCalledWith("product_images");
    expect(update).toHaveBeenCalledWith({ vendida: true });
    expect(eq).toHaveBeenCalledWith("id", "img-1");
  });

  it("retorna error si la actualizacion falla", async () => {
    const eq = vi.fn(() => Promise.resolve({ error: { message: "boom" } }));
    const update = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update })) };
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { toggleImagenVendida } = await import("../actions");
    const resultado = await toggleImagenVendida("img-1", false, "prod-1");

    expect(resultado).toEqual({ error: expect.any(String) });
  });
});
