import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));

describe("consultarStockBajo", () => {
  it("lista los productos activos con stock por debajo del umbral", async () => {
    const lt = vi.fn(async () => ({
      data: [{ name: "Pijama Rosa", stock: 2 }, { name: "Bata Dorada", stock: 0 }],
      error: null,
    }));
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ lt })) })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { consultarStockBajo } = await import("./owner-actions.ts");
    const resultado = await consultarStockBajo(5);

    expect(resultado).toContain("Pijama Rosa: 2");
    expect(resultado).toContain("Bata Dorada: 0");
  });
});

const UUID = "33333333-3333-4333-8333-333333333333";

// Mock de supabase.from(tabla).update(valores).eq(col, val).select("id").
function mockUpdate(filasActualizadas: unknown[] | null, error: unknown = null) {
  const select = vi.fn(async () => ({ data: filasActualizadas, error }));
  const eq = vi.fn(() => ({ select }));
  const update = vi.fn(() => ({ eq }));
  const or = vi.fn();
  const supabase = { from: vi.fn(() => ({ update, or })) };
  return { supabase, update, eq, select, or };
}

describe.each([
  {
    nombre: "actualizarPrecioProducto",
    llamar: async (m: typeof import("./owner-actions.ts"), id: string) => m.actualizarPrecioProducto(id, 95000),
    valores: { price: 95000 },
    exito: "95.000",
  },
  {
    nombre: "actualizarStock",
    llamar: async (m: typeof import("./owner-actions.ts"), id: string) => m.actualizarStock(id, 12),
    valores: { stock: 12 },
    exito: "12 unidades",
  },
  {
    nombre: "activarODesactivarProducto",
    llamar: async (m: typeof import("./owner-actions.ts"), id: string) => m.activarODesactivarProducto(id, false),
    valores: { is_active: false },
    exito: "desactivado",
  },
])("$nombre", ({ llamar, valores, exito }) => {
  it("con un SKU (no uuid) filtra por sku con .eq, sin .or()", async () => {
    const { supabase, update, eq, select, or } = mockUpdate([{ id: UUID }]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const modulo = await import("./owner-actions.ts");
    const resultado = await llamar(modulo, "PIJ-001");

    expect(update).toHaveBeenCalledWith(valores);
    expect(eq).toHaveBeenCalledWith("sku", "PIJ-001");
    expect(select).toHaveBeenCalledWith("id");
    expect(or).not.toHaveBeenCalled();
    expect(resultado).toContain(exito);
  });

  it("con un uuid filtra por id", async () => {
    const { supabase, eq } = mockUpdate([{ id: UUID }]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const modulo = await import("./owner-actions.ts");
    await llamar(modulo, UUID);

    expect(eq).toHaveBeenCalledWith("id", UUID);
  });

  it("si ninguna fila coincide responde 'no encontre' en vez de un exito falso", async () => {
    const { supabase } = mockUpdate([]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const modulo = await import("./owner-actions.ts");
    const resultado = await llamar(modulo, "NO-EXISTE");

    expect(resultado).toContain("No encontré ningún producto con id/sku NO-EXISTE");
    expect(resultado).not.toContain(exito);
  });

  it("lanza un error descriptivo si la actualizacion falla", async () => {
    const { supabase } = mockUpdate(null, { message: "fallo de red" });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const modulo = await import("./owner-actions.ts");
    await expect(llamar(modulo, "PIJ-001")).rejects.toThrow(/fallo de red/);
  });
});

describe("cambiarEstadoPedido", () => {
  it("si ningun pedido coincide responde 'no encontre' en vez de un exito falso", async () => {
    const { supabase, eq } = mockUpdate([]);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { cambiarEstadoPedido } = await import("./owner-actions.ts");
    const resultado = await cambiarEstadoPedido("ML-NOEXISTE", "enviado");

    expect(eq).toHaveBeenCalledWith("order_number", "ML-NOEXISTE");
    expect(resultado).toContain("No encontré ningún pedido");
  });
});

describe("consultarPedido", () => {
  function mockConsulta(pedido: unknown) {
    const maybeSingle = vi.fn(async () => ({ data: pedido, error: null }));
    const eq = vi.fn(() => ({ maybeSingle }));
    const or = vi.fn();
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ eq, or })) })) };
    return { supabase, eq, or };
  }

  it("con un numero de pedido filtra por order_number", async () => {
    const { supabase, eq, or } = mockConsulta({ order_number: "ML-20261006-abc123", status: "pagado", total: 150000, channel: "whatsapp" });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { consultarPedido } = await import("./owner-actions.ts");
    const resultado = await consultarPedido("ML-20261006-abc123");

    expect(eq).toHaveBeenCalledWith("order_number", "ML-20261006-abc123");
    expect(or).not.toHaveBeenCalled();
    expect(resultado).toContain("pagado");
  });

  it("con un uuid filtra por id", async () => {
    const { supabase, eq } = mockConsulta(null);
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { consultarPedido } = await import("./owner-actions.ts");
    const resultado = await consultarPedido(UUID);

    expect(eq).toHaveBeenCalledWith("id", UUID);
    expect(resultado).toContain("No encontre ningun pedido");
  });
});

describe("buscarCliente", () => {
  it("escapa la barra invertida antes que las comillas dentro del literal del filtro", async () => {
    const limit = vi.fn(async () => ({ data: [], error: null }));
    const or = vi.fn(() => ({ limit }));
    const supabase = { from: vi.fn(() => ({ select: vi.fn(() => ({ or })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { buscarCliente } = await import("./owner-actions.ts");
    await buscarCliente('a\\"b,x');

    // Entrada: a\"b,x  ->  literal: "%a\\\"b,x%"
    const literal = '"%a\\\\\\"b,x%"';
    expect(or).toHaveBeenCalledWith(`full_name.ilike.${literal},whatsapp.ilike.${literal}`);
  });
});

describe("ACCIONES_ESCRITURA", () => {
  it("incluye las cinco acciones de escritura de negocio", async () => {
    const { ACCIONES_ESCRITURA } = await import("./owner-actions.ts");
    expect(ACCIONES_ESCRITURA.has("actualizar_precio_producto")).toBe(true);
    expect(ACCIONES_ESCRITURA.has("actualizar_stock")).toBe(true);
    expect(ACCIONES_ESCRITURA.has("cambiar_estado_pedido")).toBe(true);
    expect(ACCIONES_ESCRITURA.has("activar_o_desactivar_producto")).toBe(true);
    expect(ACCIONES_ESCRITURA.has("consultar_ventas")).toBe(false);
  });
});
