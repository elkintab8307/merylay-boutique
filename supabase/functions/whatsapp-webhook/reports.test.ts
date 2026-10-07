import { describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));
vi.mock("./catalog.ts", () => ({ subirYFirmar: vi.fn(async () => "https://x/informe-firmado.pdf") }));

// Mock generico: cada tabla tiene una cola de respuestas {data, error} que
// se consume en orden en cada llamada a supabase.from(esa tabla) -- hace
// falta una cola (no una sola respuesta) porque algunas funciones de este
// archivo consultan la MISMA tabla mas de una vez con propositos distintos
// (ver historialCliente en tareas posteriores).
function mockSupabaseDesdeTablas(porTabla: Record<string, Array<{ data: unknown; error?: unknown }>>) {
  const contadores: Record<string, number> = {};
  const from = vi.fn((tabla: string) => {
    const cola = porTabla[tabla] ?? [{ data: [], error: null }];
    const i = contadores[tabla] ?? 0;
    contadores[tabla] = i + 1;
    const resultado = cola[Math.min(i, cola.length - 1)];
    const query: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "gte", "in", "or", "order", "limit"]) {
      query[metodo] = vi.fn(() => query);
    }
    (query as { then: unknown }).then = (resolve: (v: typeof resultado) => void) => resolve(resultado);
    query.maybeSingle = vi.fn(async () => ({
      data: Array.isArray(resultado.data) ? (resultado.data[0] ?? null) : resultado.data,
      error: resultado.error ?? null,
    }));
    return query;
  });
  return { from };
}

describe("informeVentas", () => {
  it("desglosa el total por canal y por metodo de pago", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{
        data: [
          { total: 100000, channel: "web", payment_method: "wompi", created_at: "2026-10-05T10:00:00Z" },
          { total: 50000, channel: "whatsapp", payment_method: "wompi", created_at: "2026-10-06T10:00:00Z" },
        ],
        error: null,
      }],
      pos_sales: [{
        data: [{ total: 30000, payment_method: "efectivo", created_at: "2026-10-06T12:00:00Z" }],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeVentas } = await import("./reports.ts");
    const resultado = await informeVentas(7, false);

    expect(resultado.texto).toContain("$180.000");
    expect(resultado.texto).toContain("web: $100.000");
    expect(resultado.texto).toContain("whatsapp: $50.000");
    expect(resultado.texto).toContain("pos: $30.000");
    expect(resultado.texto).toContain("wompi: $150.000");
    expect(resultado.texto).toContain("efectivo: $30.000");
    expect(resultado.documentos).toHaveLength(0);
  });

  it("sin ventas en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [], error: null }],
      pos_sales: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeVentas } = await import("./reports.ts");
    const resultado = await informeVentas(1, false);

    expect(resultado.texto).toContain("No hubo ventas");
    expect(resultado.documentos).toHaveLength(0);
  });

  it("con conPdf=true, sube el PDF y lo manda como documento", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ total: 100000, channel: "web", payment_method: "wompi", created_at: "2026-10-05T10:00:00Z" }], error: null }],
      pos_sales: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");

    const { informeVentas } = await import("./reports.ts");
    const resultado = await informeVentas(7, true);

    expect(subirYFirmar).toHaveBeenCalled();
    expect(resultado.documentos).toEqual([{ link: "https://x/informe-firmado.pdf", filename: "informe-ventas-merylay.pdf" }]);
  });

  it("con conPdf=false, no sube ningun PDF", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ total: 100000, channel: "web", payment_method: "wompi", created_at: "2026-10-05T10:00:00Z" }], error: null }],
      pos_sales: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");
    vi.clearAllMocks();
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeVentas } = await import("./reports.ts");
    await informeVentas(7, false);

    expect(subirYFirmar).not.toHaveBeenCalled();
  });
});

describe("productosMasVendidos", () => {
  it("combina en una sola fila las ventas del mismo producto venidas de order_items y pos_sale_items", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{ data: [{ product_id: "p1", qty: 2, line_total: 80000 }], error: null }],
      pos_sale_items: [{ data: [{ product_id: "p1", qty: 1, line_total: 40000 }], error: null }],
      products: [{ data: [{ id: "p1", name: "Pijama Rosa" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(30, 10, false);

    expect(resultado.texto).toContain("Pijama Rosa — 3 unidad(es), $120.000");
    // una sola linea para "Pijama Rosa", no dos
    expect(resultado.texto.match(/Pijama Rosa/g)).toHaveLength(1);
  });

  it("ordena por unidades vendidas, de mayor a menor, y respeta el limite en texto", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{
        data: [
          { product_id: "p1", qty: 1, line_total: 40000 },
          { product_id: "p2", qty: 5, line_total: 200000 },
        ],
        error: null,
      }],
      pos_sale_items: [{ data: [], error: null }],
      products: [{ data: [{ id: "p1", name: "Camiseta A" }, { id: "p2", name: "Camiseta B" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(30, 1, false);

    expect(resultado.texto).toContain("1. Camiseta B");
    expect(resultado.texto).not.toContain("Camiseta A");
  });

  it("descarta filas con product_id nulo (producto borrado) sin fallar", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{ data: [{ product_id: null, qty: 2, line_total: 80000 }], error: null }],
      pos_sale_items: [{ data: [], error: null }],
      products: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(30, 10, false);

    expect(resultado.texto).toContain("No hubo productos vendidos");
  });

  it("sin ventas en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{ data: [], error: null }],
      pos_sale_items: [{ data: [], error: null }],
      products: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(1, 10, false);

    expect(resultado.texto).toContain("No hubo productos vendidos");
  });

  it("con conPdf=true, genera el PDF sin el tope de 'limite' (hasta 50)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: [{ data: [{ product_id: "p1", qty: 2, line_total: 80000 }], error: null }],
      pos_sale_items: [{ data: [], error: null }],
      products: [{ data: [{ id: "p1", name: "Pijama Rosa" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");

    const { productosMasVendidos } = await import("./reports.ts");
    const resultado = await productosMasVendidos(30, 1, true);

    expect(subirYFirmar).toHaveBeenCalled();
    expect(resultado.documentos).toHaveLength(1);
  });
});
