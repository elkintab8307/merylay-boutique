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

describe("actualizarPrecioProducto", () => {
  it("actualiza el precio por id o sku y confirma en texto", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const or = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update: vi.fn(() => ({ or })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { actualizarPrecioProducto } = await import("./owner-actions.ts");
    const resultado = await actualizarPrecioProducto("PIJ-001", 95000);

    expect(resultado).toContain("95.000");
    expect(or).toHaveBeenCalledWith('id.eq."PIJ-001",sku.eq."PIJ-001"');
  });

  it("escapa un valor con coma para que no inyecte una clausula extra en el filtro", async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const or = vi.fn(() => ({ eq }));
    const supabase = { from: vi.fn(() => ({ update: vi.fn(() => ({ or })) })) };
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { actualizarPrecioProducto } = await import("./owner-actions.ts");
    const idMalicioso = 'P1,is_active.eq.false';
    await actualizarPrecioProducto(idMalicioso, 95000);

    const filtroEnviado = or.mock.calls[0][0] as string;
    // El valor completo, con su coma interna, debe viajar entre comillas
    // como un unico literal — no debe aparecer una clausula adicional
    // "is_active.eq.false" fuera de las comillas del valor original.
    expect(filtroEnviado).toBe(
      `id.eq."${idMalicioso}",sku.eq."${idMalicioso}"`,
    );
    expect(filtroEnviado).not.toContain('id.eq.P1,is_active.eq.false,sku');
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
