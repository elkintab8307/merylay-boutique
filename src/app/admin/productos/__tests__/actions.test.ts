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

describe("createProducto / updateProducto — stock segun variantes", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const inputBase = {
    name: "Pijama test",
    slug: "pijama-test",
    description: "",
    categoryId: null,
    price: 10000,
    promoPrice: null,
    costPrice: null,
    stock: 9,
    isActive: true,
    isFeatured: false,
    variantes: [] as Array<{
      talla?: string;
      color?: string;
      priceOverride: number | null;
      nuevaColeccion: boolean;
    }>,
  };

  function mockParaCreate() {
    const productsInsertSpy = vi.fn(() => ({
      select: () => ({ single: () => Promise.resolve({ data: { id: "p1" }, error: null }) }),
    }));
    const from = vi.fn((tabla: string) => {
      if (tabla === "products") {
        return {
          // uniqueSlug: select().eq().maybeSingle()  y   select().eq().neq().maybeSingle()
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
          insert: productsInsertSpy,
        };
      }
      if (tabla === "product_variants") {
        return {
          insert: () => ({ select: () => Promise.resolve({ data: [{ id: "11111111-1111-4111-8111-111111111111" }], error: null }) }),
        };
      }
      if (tabla === "product_costs") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    const rpc = vi.fn(() => Promise.resolve({ data: "SKU-1", error: null }));
    return { supabase: { from, rpc }, productsInsertSpy };
  }

  it("createProducto sin variantes escribe el stock del formulario", async () => {
    const { supabase, productsInsertSpy } = mockParaCreate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { createProducto } = await import("../actions");

    await createProducto({ ...inputBase, variantes: [] }, [], []);

    expect(productsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 9 }),
    );
  });

  it("createProducto con variantes escribe stock 0 (lo calcula el trigger)", async () => {
    const { supabase, productsInsertSpy } = mockParaCreate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { createProducto } = await import("../actions");

    await createProducto(
      {
        ...inputBase,
        variantes: [{ talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false }],
      },
      [],
      [],
    );

    expect(productsInsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 0 }),
    );
  });

  function mockParaUpdate() {
    const productsUpdateSpy = vi.fn<(payload: Record<string, unknown>) => unknown>(() => ({
      eq: () => ({
        select: () => ({ single: () => Promise.resolve({ data: { sku: "SKU-1" }, error: null }) }),
      }),
    }));
    const from = vi.fn((tabla: string) => {
      if (tabla === "products") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
          update: productsUpdateSpy,
        };
      }
      if (tabla === "product_variants") {
        return {
          select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
          insert: () => ({ select: () => Promise.resolve({ data: [{ id: "11111111-1111-4111-8111-111111111111" }], error: null }) }),
          upsert: () => Promise.resolve({ error: null }),
          delete: () => ({ in: () => Promise.resolve({ error: null }) }),
        };
      }
      if (tabla === "product_costs") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    return { supabase: { from, rpc: vi.fn() }, productsUpdateSpy };
  }

  it("updateProducto sin variantes incluye stock en el update", async () => {
    const { supabase, productsUpdateSpy } = mockParaUpdate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto("p1", { ...inputBase, variantes: [] }, [], []);

    expect(productsUpdateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ stock: 9 }),
    );
  });

  it("updateProducto con variantes NO incluye stock en el update", async () => {
    const { supabase, productsUpdateSpy } = mockParaUpdate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto(
      "p1",
      {
        ...inputBase,
        variantes: [{ talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false }],
      },
      [],
      [],
    );

    const payload = productsUpdateSpy.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("stock");
  });
});

describe("createProducto / updateProducto — nueva coleccion", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const inputBase = {
    name: "Pijama test",
    slug: "pijama-test",
    description: "",
    categoryId: null,
    price: 10000,
    promoPrice: null,
    costPrice: null,
    stock: 9,
    isActive: true,
    isFeatured: false,
    variantes: [] as Array<{
      id?: string;
      talla?: string;
      color?: string;
      priceOverride: number | null;
      nuevaColeccion: boolean;
    }>,
  };

  function mockParaCreate() {
    const variantesInsertSpy = vi.fn<
      (payload: Array<Record<string, unknown>>) => unknown
    >(() => ({
      select: () => Promise.resolve({ data: [{ id: "11111111-1111-4111-8111-111111111111" }], error: null }),
    }));
    const from = vi.fn((tabla: string) => {
      if (tabla === "products") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
          insert: () => ({
            select: () => ({ single: () => Promise.resolve({ data: { id: "p1" }, error: null }) }),
          }),
        };
      }
      if (tabla === "product_variants") {
        return { insert: variantesInsertSpy };
      }
      if (tabla === "product_costs") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    const rpc = vi.fn(() => Promise.resolve({ data: "SKU-1", error: null }));
    return { supabase: { from, rpc }, variantesInsertSpy };
  }

  it("createProducto con el checkbox marcado guarda nueva_coleccion_desde no nulo", async () => {
    const { supabase, variantesInsertSpy } = mockParaCreate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { createProducto } = await import("../actions");

    await createProducto(
      {
        ...inputBase,
        variantes: [{ talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: true }],
      },
      [],
      [],
    );

    const payload = variantesInsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).not.toBeNull();
    expect(typeof payload[0].nueva_coleccion_desde).toBe("string");
  });

  it("createProducto con el checkbox sin marcar guarda nueva_coleccion_desde null", async () => {
    const { supabase, variantesInsertSpy } = mockParaCreate();
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { createProducto } = await import("../actions");

    await createProducto(
      {
        ...inputBase,
        variantes: [{ talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false }],
      },
      [],
      [],
    );

    const payload = variantesInsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).toBeNull();
  });

  function mockParaUpdate(nuevaColeccionDesdeExistente: string | null) {
    const variantesUpsertSpy = vi.fn<
      (payload: Array<Record<string, unknown>>) => unknown
    >(() => Promise.resolve({ error: null }));
    const from = vi.fn((tabla: string) => {
      if (tabla === "products") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
              neq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
          update: () => ({
            eq: () => ({
              select: () => ({ single: () => Promise.resolve({ data: { sku: "SKU-1" }, error: null }) }),
            }),
          }),
        };
      }
      if (tabla === "product_variants") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [{ id: "11111111-1111-4111-8111-111111111111", nueva_coleccion_desde: nuevaColeccionDesdeExistente }],
                error: null,
              }),
          }),
          upsert: variantesUpsertSpy,
          delete: () => ({ in: () => Promise.resolve({ error: null }) }),
        };
      }
      if (tabla === "product_costs") {
        return { upsert: () => Promise.resolve({ error: null }) };
      }
      throw new Error(`tabla inesperada: ${tabla}`);
    });
    return { supabase: { from, rpc: vi.fn() }, variantesUpsertSpy };
  }

  it("updateProducto: variante ya activa que se guarda sin tocar el checkbox conserva la fecha", async () => {
    const desdeExistente = "2026-09-10T00:00:00.000Z";
    const { supabase, variantesUpsertSpy } = mockParaUpdate(desdeExistente);
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto(
      "p1",
      {
        ...inputBase,
        variantes: [
          { id: "11111111-1111-4111-8111-111111111111", talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: true },
        ],
      },
      [],
      [],
    );

    const payload = variantesUpsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).toBe(desdeExistente);
  });

  it("updateProducto: desmarcar una variante activa pone nueva_coleccion_desde en null", async () => {
    const { supabase, variantesUpsertSpy } = mockParaUpdate("2026-09-10T00:00:00.000Z");
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto(
      "p1",
      {
        ...inputBase,
        variantes: [
          { id: "11111111-1111-4111-8111-111111111111", talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: false },
        ],
      },
      [],
      [],
    );

    const payload = variantesUpsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).toBeNull();
  });

  it("updateProducto: marcar una variante que estaba inactiva guarda una fecha nueva", async () => {
    const { supabase, variantesUpsertSpy } = mockParaUpdate(null);
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const { updateProducto } = await import("../actions");

    await updateProducto(
      "p1",
      {
        ...inputBase,
        variantes: [
          { id: "11111111-1111-4111-8111-111111111111", talla: "M", color: "Rosa", priceOverride: null, nuevaColeccion: true },
        ],
      },
      [],
      [],
    );

    const payload = variantesUpsertSpy.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(payload[0].nueva_coleccion_desde).not.toBeNull();
  });
});
