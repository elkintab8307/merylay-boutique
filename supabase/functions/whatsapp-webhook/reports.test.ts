import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../_shared/db.ts", () => ({ getSupabase: vi.fn() }));
vi.mock("./catalog.ts", () => ({ subirYFirmar: vi.fn(async () => "https://x/informe-firmado.pdf") }));

// generarPdfTabla ahora vive en pdf-render.ts (le pide a un endpoint de
// Vercel que renderice HTML a PDF) y se mockea por completo -- reports.ts
// ya no dibuja PDFs directamente. El mock captura el contenido de `filas`
// tal cual se lo pasan las funciones de este archivo, para poder verificar
// (test de zona horaria, mas abajo) que la fecha de una fila sale en hora
// de Bogota y no en UTC.
const pdfLibCapturado = vi.hoisted(() => ({ textos: [] as string[] }));
vi.mock("./pdf-render.ts", () => ({
  generarPdfTabla: vi.fn(async (_titulo: string, _encabezados: string[], filas: string[][]) => {
    filas.forEach((fila) => fila.forEach((valor) => pdfLibCapturado.textos.push(valor)));
    return new Uint8Array([1, 2, 3]);
  }),
}));

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

  it("con conPdf=true, usa el banner de informe de ventas", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ total: 100000, channel: "web", payment_method: "wompi", created_at: "2026-10-05T10:00:00Z" }], error: null }],
      pos_sales: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    const { informeVentas } = await import("./reports.ts");
    await informeVentas(7, true);

    expect(generarPdfTabla).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
      { bannerArchivo: "informe-ventas-banner.jpg" },
    );
  });

  it("con conPdf=true, la fila del PDF usa la fecha de Bogota, no la de UTC, para una venta tarde en la noche", async () => {
    // 2026-10-08T01:30:00Z son las 8:30pm del 7 de octubre en Bogota
    // (UTC-5). Si la fila del PDF usara la zona horaria de la sesion (UTC,
    // como corre Deno Edge Functions) en vez de America/Bogota, mostraria
    // 8/10/2026 en lugar de 7/10/2026.
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ total: 100000, channel: "web", payment_method: "wompi", created_at: "2026-10-08T01:30:00Z" }], error: null }],
      pos_sales: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    pdfLibCapturado.textos.length = 0;

    const tzOriginal = process.env.TZ;
    process.env.TZ = "UTC"; // simula el runtime real de Edge Functions
    try {
      const { informeVentas } = await import("./reports.ts");
      await informeVentas(7, true);
    } finally {
      // tzOriginal es `undefined` cuando TZ no estaba seteada (el caso
      // normal en esta maquina/CI) -- asignar `process.env.TZ = undefined`
      // lo convierte en la STRING "undefined", dejando la zona horaria
      // contaminada para el resto de tests de este archivo. Hay que borrar
      // la variable en vez de asignarle `undefined`.
      if (tzOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = tzOriginal;
    }

    expect(pdfLibCapturado.textos).toContain("7/10/2026");
    expect(pdfLibCapturado.textos).not.toContain("8/10/2026");
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

  it("con conPdf=true, usa el banner de informe de clientes", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: [{ data: [{ user_id: "profile-1", total: 100000 }], error: null }],
      pos_sales: [{ data: [], error: null }],
      pos_customers: [{ data: [], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    const { informeClientes } = await import("./reports.ts");
    await informeClientes(30, 10, true);

    expect(generarPdfTabla).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      expect.any(Array),
      { bannerArchivo: "informe-clientes-banner.jpg" },
    );
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

  it("con mas de 10 compras, el total suma TODAS pero el texto solo lista las 10 mas recientes y avisa del resto", async () => {
    const compras = Array.from({ length: 12 }, (_, i) => ({
      order_number: `ML-${i + 1}`,
      total: 10000,
      created_at: `2026-09-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
      channel: "web",
    }));
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [
        { data: [], error: null }, // busqueda por texto: sin coincidencias
        { data: [], error: null }, // busqueda por profile_id vinculado: ninguna
      ],
      orders: [{ data: compras, error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    // El total ($120.000, 12 compras) refleja las 12 compras completas, no
    // solo las 10 que aparecen listadas en el texto.
    expect(resultado.texto).toContain("$120.000 en 12 compra(s)");
    expect(resultado.texto).toContain("y 2 compra(s) más.");
    expect(resultado.texto).not.toContain("ML-1:"); // la mas antigua (01-sep) queda fuera de las 10 mas recientes
  });

  it("la fecha del detalle usa hora de Bogota, no UTC, para una compra tarde en la noche", async () => {
    // 2026-10-08T01:30:00Z son las 8:30pm del 7 de octubre en Bogota.
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [
        { data: [], error: null },
        { data: [], error: null },
      ],
      orders: [{ data: [{ order_number: "ML-1", total: 100000, created_at: "2026-10-08T01:30:00Z", channel: "web" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const tzOriginal = process.env.TZ;
    process.env.TZ = "UTC"; // simula el runtime real de Edge Functions
    let resultado: Awaited<ReturnType<typeof import("./reports.ts").historialCliente>>;
    try {
      const { historialCliente } = await import("./reports.ts");
      resultado = await historialCliente("Juan");
    } finally {
      // Ver la nota equivalente en el test de informeVentas arriba: borrar
      // la variable si no estaba seteada, no asignarle `undefined`.
      if (tzOriginal === undefined) delete process.env.TZ;
      else process.env.TZ = tzOriginal;
    }

    expect(resultado.texto).toContain("7/10/2026");
    expect(resultado.texto).not.toContain("8/10/2026");
  });

  it("un perfil con DOS pos_customers vinculados (sin restriccion de unicidad en profile_id) suma las ventas POS de ambos, no solo una", async () => {
    const supabase = mockSupabaseDesdeTablas({
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_customers: [
        { data: [], error: null }, // busqueda por texto: sin coincidencias
        { data: [{ id: "pos-1" }, { id: "pos-2" }], error: null }, // busqueda por profile_id: AMBOS vinculados
      ],
      orders: [{ data: [], error: null }],
      pos_sales: [{
        data: [
          { sale_number: "POS-1", total: 50000, created_at: "2026-10-01T10:00:00Z" },
          { sale_number: "POS-2", total: 70000, created_at: "2026-10-02T10:00:00Z" },
        ],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { historialCliente } = await import("./reports.ts");
    const resultado = await historialCliente("Juan");

    expect(resultado.texto).toContain("POS-1");
    expect(resultado.texto).toContain("POS-2");
    expect(resultado.texto).toContain("$120.000 en 2 compra(s)");

    // El mock no filtra pos_sales por el argumento de .eq()/.in() -- sin
    // esta asercion, el test pasaria igual contra el codigo viejo (que
    // consultaba con .eq("customer_id", "pos-1"), un solo id). Se verifica
    // directamente que la consulta real uso .in() con AMBOS ids vinculados,
    // no un .eq() con uno solo.
    const llamadaPosSales = supabase.from.mock.calls.findIndex((llamada: unknown[]) => llamada[0] === "pos_sales");
    expect(llamadaPosSales).toBeGreaterThanOrEqual(0);
    const queryPosSales = supabase.from.mock.results[llamadaPosSales].value;
    expect(queryPosSales.in).toHaveBeenCalledWith("customer_id", ["pos-1", "pos-2"]);
    expect(queryPosSales.eq).not.toHaveBeenCalledWith("customer_id", expect.anything());
  });
});

describe("informeGastos", () => {
  it("desglosa el total por categoria", async () => {
    const supabase = mockSupabaseDesdeTablas({
      expenses: [{
        data: [
          { description: "Arriendo", amount: 500000, expense_date: "2026-10-01", expense_categories: { name: "Renta" } },
          { description: "Internet", amount: 80000, expense_date: "2026-10-03", expense_categories: { name: "Servicios" } },
        ],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeGastos } = await import("./reports.ts");
    const resultado = await informeGastos(30, false);

    expect(resultado.texto).toContain("$580.000");
    expect(resultado.texto).toContain("Renta: $500.000");
    expect(resultado.texto).toContain("Servicios: $80.000");
    expect(resultado.documentos).toHaveLength(0);
  });

  it("agrupa los gastos sin categoria como 'Sin categoría'", async () => {
    const supabase = mockSupabaseDesdeTablas({
      expenses: [{ data: [{ description: "Varios", amount: 20000, expense_date: "2026-10-03", expense_categories: null }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeGastos } = await import("./reports.ts");
    const resultado = await informeGastos(30, false);

    expect(resultado.texto).toContain("Sin categoría: $20.000");
  });

  it("sin gastos en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({ expenses: [{ data: [], error: null }] });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeGastos } = await import("./reports.ts");
    const resultado = await informeGastos(1, false);

    expect(resultado.texto).toContain("No hubo gastos registrados");
  });

  it("con conPdf=true, genera el PDF con el detalle", async () => {
    const supabase = mockSupabaseDesdeTablas({
      expenses: [{ data: [{ description: "Arriendo", amount: 500000, expense_date: "2026-10-01", expense_categories: { name: "Renta" } }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { subirYFirmar } = await import("./catalog.ts");

    const { informeGastos } = await import("./reports.ts");
    const resultado = await informeGastos(30, true);

    expect(subirYFirmar).toHaveBeenCalled();
    expect(resultado.documentos).toEqual([{ link: "https://x/informe-firmado.pdf", filename: "informe-gastos-merylay.pdf" }]);
  });
});

describe("informeCreditos", () => {
  it("desglosa total vendido a credito, cuantas ventas y cuantas con saldo pendiente", async () => {
    const supabase = mockSupabaseDesdeTablas({
      pos_sales: [{
        data: [
          { id: "venta-1", sale_number: "POS-1", customer_id: "cli-1", total: 200000, created_at: "2026-10-05T10:00:00Z" },
          { id: "venta-2", sale_number: "POS-2", customer_id: "cli-2", total: 100000, created_at: "2026-10-06T10:00:00Z" },
        ],
        error: null,
      }],
      credit_installments: [{
        data: [
          { sale_id: "venta-1", amount: 100000, paid_amount: 50000, status: "parcial" },
          { sale_id: "venta-2", amount: 100000, paid_amount: 100000, status: "pagada" },
        ],
        error: null,
      }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeCreditos } = await import("./reports.ts");
    const resultado = await informeCreditos(7, false);

    expect(resultado.texto).toContain("$300.000 en 2 venta(s)");
    expect(resultado.texto).toContain("1 con saldo pendiente");
    expect(resultado.documentos).toHaveLength(0);
  });

  it("sin ventas a credito en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({ pos_sales: [{ data: [], error: null }] });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeCreditos } = await import("./reports.ts");
    const resultado = await informeCreditos(7, false);

    expect(resultado.texto).toContain("No hubo ventas a crédito");
  });

  it("con conPdf=true, el detalle incluye cliente (fusion de identidad), productos y saldo pendiente por venta", async () => {
    const supabase = mockSupabaseDesdeTablas({
      pos_sales: [{
        data: [{ id: "venta-1", sale_number: "POS-1", customer_id: "cli-1", total: 200000, created_at: "2026-10-05T10:00:00Z" }],
        error: null,
      }],
      credit_installments: [{
        data: [{ sale_id: "venta-1", amount: 200000, paid_amount: 50000, status: "parcial" }],
        error: null,
      }],
      pos_customers: [{ data: [{ id: "cli-1", profile_id: "profile-1", nombre: "Juan (POS)" }], error: null }],
      profiles: [{ data: [{ id: "profile-1", full_name: "Juan Pérez", username: "juan" }], error: null }],
      pos_sale_items: [{ data: [{ sale_id: "venta-1", product_id: "prod-1" }, { sale_id: "venta-1", product_id: "prod-2" }], error: null }],
      products: [{ data: [{ id: "prod-1", name: "Pijama Rosa" }, { id: "prod-2", name: "Bata Dorada" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    const { informeCreditos } = await import("./reports.ts");
    await informeCreditos(7, true);

    expect(generarPdfTabla).toHaveBeenCalledWith(
      expect.any(String),
      ["Fecha", "Cliente", "Productos", "Total", "Saldo pendiente"],
      [["5/10/2026", "Juan Pérez", "Pijama Rosa, Bata Dorada", "$200.000", "$150.000"]],
      { bannerArchivo: "informe-creditos-banner.jpg" },
    );
  });

  it("una venta a credito sin customer_id (mostrador) no revienta: muestra un nombre generico", async () => {
    const supabase = mockSupabaseDesdeTablas({
      pos_sales: [{
        data: [{ id: "venta-1", sale_number: "POS-1", customer_id: null, total: 50000, created_at: "2026-10-05T10:00:00Z" }],
        error: null,
      }],
      credit_installments: [{ data: [], error: null }],
      pos_sale_items: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    const { informeCreditos } = await import("./reports.ts");
    await expect(informeCreditos(7, true)).resolves.not.toThrow();

    expect(generarPdfTabla).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Array),
      [["5/10/2026", "Cliente", "—", "$50.000", "$0"]],
      { bannerArchivo: "informe-creditos-banner.jpg" },
    );
  });

  it("la fecha del PDF usa hora de Bogota, no UTC, para una venta tarde en la noche", async () => {
    // 2026-10-08T01:30:00Z son las 8:30pm del 7 de octubre en Bogota
    // (UTC-5). Si la fila usara UTC en vez de America/Bogota, mostraria
    // 8/10/2026 en lugar de 7/10/2026 -- mismo caso limite que ya se
    // prueba en informeVentas/historialCliente, repetido aqui porque
    // informeCreditos formatea la fecha con su propio codigo (no
    // comparte esa linea con los demas informes).
    const supabase = mockSupabaseDesdeTablas({
      pos_sales: [{
        data: [{ id: "venta-1", sale_number: "POS-1", customer_id: null, total: 50000, created_at: "2026-10-08T01:30:00Z" }],
        error: null,
      }],
      credit_installments: [{ data: [], error: null }],
      pos_sale_items: [{ data: [], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    const { informeCreditos } = await import("./reports.ts");
    await informeCreditos(7, true);

    // Se usa la ULTIMA llamada (no calls[0]): el mock de generarPdfTabla no
    // se limpia entre describe blocks de este archivo (salvo un
    // vi.clearAllMocks() puntual dentro de "informeVentas"), asi que para
    // este punto del archivo el indice 0 ya no corresponde a esta prueba
    // sino a una llamada de un informe anterior.
    const llamadas = (generarPdfTabla as unknown as ReturnType<typeof vi.fn>).mock.calls;
    const [, , filas] = llamadas[llamadas.length - 1] as [string, string[], string[][]];
    expect(filas[0][0]).toBe("7/10/2026");
    expect(filas[0][0]).not.toBe("8/10/2026");
  });
});

describe("informeAbonos", () => {
  // A diferencia del resto del archivo, este describe SI limpia los mocks
  // antes de cada prueba: el mock de generarPdfTabla acumula llamadas de
  // TODOS los describe blocks anteriores (no hay un beforeEach a nivel de
  // archivo), y con esto nuestras pruebas pueden usar mock.calls[0] en vez
  // de tener que indexar a la ultima llamada como hizo informeCreditos.
  beforeEach(() => vi.clearAllMocks());

  it("desglosa el total abonado y lista cada abono con su cliente (a diferencia de otros informes, el texto SI lista cada uno)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      credit_payments: [{
        data: [
          { id: "pago-1", sale_id: "venta-1", amount: 50000, payment_method: "efectivo", created_at: "2026-10-05T15:00:00Z" },
        ],
        error: null,
      }],
      pos_sales: [{ data: [{ id: "venta-1", sale_number: "POS-1", customer_id: "cli-1" }], error: null }],
      pos_customers: [{ data: [{ id: "cli-1", profile_id: null, nombre: "Ana López" }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeAbonos } = await import("./reports.ts");
    const resultado = await informeAbonos(1, false);

    expect(resultado.texto).toContain("$50.000 en 1 abono(s)");
    expect(resultado.texto).toContain("Ana López");
    expect(resultado.texto).toContain("$50.000");
  });

  it("sin abonos en el periodo, responde un mensaje claro", async () => {
    const supabase = mockSupabaseDesdeTablas({ credit_payments: [{ data: [], error: null }] });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeAbonos } = await import("./reports.ts");
    const resultado = await informeAbonos(1, false);

    expect(resultado.texto).toContain("No hubo abonos registrados");
  });

  it("con mas de 10 abonos, el texto corta en 10 y avisa cuantos mas hay", async () => {
    const abonos = Array.from({ length: 12 }, (_, i) => ({
      id: `pago-${i}`, sale_id: `venta-${i}`, amount: 10000, payment_method: "efectivo", created_at: `2026-10-0${(i % 9) + 1}T15:00:00Z`,
    }));
    const supabase = mockSupabaseDesdeTablas({
      credit_payments: [{ data: abonos, error: null }],
      pos_sales: [{ data: abonos.map((a) => ({ id: a.sale_id, sale_number: "POS-X", customer_id: null })), error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);

    const { informeAbonos } = await import("./reports.ts");
    const resultado = await informeAbonos(9, false);

    expect(resultado.texto).toContain("y 2 abono(s) más");
  });

  it("con conPdf=true, cada fila liga el abono a su venta (sale_number)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      credit_payments: [{
        data: [{ id: "pago-1", sale_id: "venta-1", amount: 50000, payment_method: "nequi", created_at: "2026-10-05T15:00:00Z" }],
        error: null,
      }],
      pos_sales: [{ data: [{ id: "venta-1", sale_number: "POS-7", customer_id: null }], error: null }],
    });
    const { getSupabase } = await import("../_shared/db.ts");
    (getSupabase as unknown as ReturnType<typeof vi.fn>).mockReturnValue(supabase);
    const { generarPdfTabla } = await import("./pdf-render.ts");

    const { informeAbonos } = await import("./reports.ts");
    await informeAbonos(1, true);

    expect(generarPdfTabla).toHaveBeenCalledWith(
      expect.any(String),
      ["Fecha", "Cliente", "Monto", "Método", "Venta"],
      [["5/10/2026", "Cliente", "$50.000", "nequi", "POS-7"]],
    );
  });
});
