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

describe("informeClientes", () => {
  it("fusiona en una sola fila a un cliente que compra por web/WhatsApp y por POS (pos_customers.profile_id vinculado)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ user_id: "profile-1", total: 100000 }], error: null }],
      pos_sales: [{ data: [{ customer_id: "pos-cliente-1", total: 50000 }], error: null }],
      pos_customers: [{ data: [{ id: "pos-cliente-1", profile_id: "profile-1", nombre: "Juan (POS)" }], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeClientes } = await import("./reports.ts");
    const resultado = await informeClientes(30, 10, false);

    expect(resultado.texto).toContain("Juan Pérez — $150.000 en 2 compra(s)");
    expect(resultado.texto.match(/Juan/g)).toHaveLength(1);
  });

  it("cliente vinculado a un perfil sin pedidos web/WhatsApp (su fila nace en el loop de POS): usa el nombre del perfil, no el de pos_customers", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [], error: null }],
      pos_sales: [{ data: [{ customer_id: "pos-cliente-1", total: 50000 }], error: null }],
      pos_customers: [{ data: [{ id: "pos-cliente-1", profile_id: "profile-1", nombre: "Juan (POS)" }], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeClientes } = await import("./reports.ts");
    const resultado = await informeClientes(30, 10, false);

    expect(resultado.texto).toContain("Juan Pérez");
    expect(resultado.texto).not.toContain("Juan (POS)");
  });

  it("excluye ventas de POS sin customer_id (venta de mostrador sin cliente)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [], error: null }],
      pos_sales: [{ data: [{ customer_id: null, total: 50000 }], error: null }],
      pos_customers: [{ data: [], error: null }],
      profiles: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeClientes } = await import("./reports.ts");
    const resultado = await informeClientes(30, 10, false);

    expect(resultado.texto).toContain("No hubo clientes identificados");
  });

  it("ordena por total gastado de mayor a menor", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{
        data: [
          { user_id: "profile-1", total: 50000 },
          { user_id: "profile-2", total: 200000 },
        ],
        error: null,
      }],
      pos_sales: [{ data: [], error: null }],
      pos_customers: [{ data: [], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Cliente Chico", username: "c1" }, { id: "profile-2", full_name: "Cliente Grande", username: "c2" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeClientes } = await import("./reports.ts");
    const resultado = await informeClientes(30, 10, false);

    expect(resultado.texto.indexOf("Cliente Grande")).toBeLessThan(resultado.texto.indexOf("Cliente Chico"));
  });

  it("con conPdf=true, genera el PDF", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ user_id: "profile-1", total: 100000 }], error: null }],
      pos_sales: [{ data: [], error: null }],
      pos_customers: [{ data: [], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");

    const { informeClientes } = await import("./reports.ts");
    const resultado = await informeClientes(30, 10, true);

    expect(subirYFirmar).toHaveBeenCalled();
    expect(resultado.documentos).toHaveLength(1);
  });
});

describe("historialCliente", () => {
  it("encuentra un cliente por nombre parcial y devuelve su historial con el total acumulado", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [
        { data: [], error: null }, // busqueda por texto: sin coincidencias en pos_customers
        { data: [], error: null }, // busqueda por profile_id vinculado: ninguna
      ],
      orders: [{
        data: [{ order_number: "ML-1", total: 100000, created_at: "2026-10-05T10:00:00Z", channel: "web" }],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).toContain("Historial de Juan Pérez");
    expect(resultado.texto).toContain("$100.000 en 1 compra(s)");
    expect(resultado.texto).toContain("ML-1");
  });

  it("cliente no encontrado, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [], error: null }],
      pos_customers: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Nadie");

    expect(resultado.texto).toContain("No encontré ningún cliente");
  });

  it("varias coincidencias reales (personas distintas), pide precisar", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }, { id: "profile-2", full_name: "Juana Gómez", username: "juana" }], error: null }],
      pos_customers: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).toContain("varios clientes");
  });

  it("un pos_customer vinculado (profile_id) a un perfil ya encontrado NO cuenta como candidato adicional (no es ambiguo)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [
        { data: [{ id: "pos-1", profile_id: "profile-1", nombre: "Juan (POS)" }], error: null }, // busqueda por texto: coincide, pero es el MISMO profile-1
        { data: [{ id: "pos-1" }], error: null }, // busqueda por profile_id vinculado: la encuentra
      ],
      orders: [{ data: [], error: null }],
      pos_sales: [{ data: [{ sale_number: "POS-1", total: 50000, created_at: "2026-10-06T10:00:00Z" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).not.toContain("varios clientes");
    expect(resultado.texto).toContain("Historial de Juan Pérez");
    expect(resultado.texto).toContain("POS-1");
  });

  it("fusiona y ordena por fecha descendente las compras de orders Y pos_sales del mismo cliente (fuentes intercaladas)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [
        { data: [], error: null }, // busqueda por texto: sin coincidencias en pos_customers
        { data: [{ id: "pos-1" }], error: null }, // busqueda por profile_id vinculado: la encuentra
      ],
      orders: [{
        data: [
          { order_number: "ML-1", total: 100000, created_at: "2026-10-01T10:00:00Z", channel: "web" },
          { order_number: "ML-2", total: 300000, created_at: "2026-10-05T10:00:00Z", channel: "web" },
        ],
        error: null,
      }],
      pos_sales: [{
        data: [{ sale_number: "POS-1", total: 50000, created_at: "2026-10-03T10:00:00Z" }],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).toContain("Historial de Juan Pérez");
    expect(resultado.texto).toContain("$450.000 en 3 compra(s)");
    // orden descendente por fecha, intercalando orders y pos_sales: ML-2 (05-oct) > POS-1 (03-oct) > ML-1 (01-oct)
    const posicionMl2 = resultado.texto.indexOf("ML-2");
    const posicionPos1 = resultado.texto.indexOf("POS-1");
    const posicionMl1 = resultado.texto.indexOf("ML-1");
    expect(posicionMl2).toBeGreaterThan(-1);
    expect(posicionPos1).toBeGreaterThan(-1);
    expect(posicionMl1).toBeGreaterThan(-1);
    expect(posicionMl2).toBeLessThan(posicionPos1);
    expect(posicionPos1).toBeLessThan(posicionMl1);
  });

  it("cliente encontrado sin compras registradas, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [{ data: [], error: null }, { data: [], error: null }],
      orders: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).toContain("no tiene compras registradas");
  });
});
