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
