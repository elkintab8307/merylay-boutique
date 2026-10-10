import { beforeEach, describe, expect, it, vi } from "vitest";

const enviarTextoMock = vi.hoisted(() => vi.fn());
const enviarImagenPorLinkMock = vi.hoisted(() => vi.fn());
vi.mock("../_shared/meta.ts", () => ({
  enviarTexto: enviarTextoMock,
  enviarImagenPorLink: enviarImagenPorLinkMock,
}));

const getSupabaseMock = vi.hoisted(() => vi.fn());
vi.mock("../_shared/db.ts", () => ({ getSupabase: getSupabaseMock }));

// Mock generico: cada tabla tiene una respuesta fija {data, error} que se
// devuelve sin importar los filtros encadenados (select/eq/in) -- mismo
// patron usado en reports.test.ts. Las pruebas de este archivo no
// necesitan distinguir entre varias llamadas a la MISMA tabla.
function mockSupabaseDesdeTablas(porTabla: Record<string, { data: unknown; error?: unknown }>) {
  const from = vi.fn((tabla: string) => {
    const resultado = porTabla[tabla] ?? { data: [], error: null };
    const query: Record<string, unknown> = {};
    for (const metodo of ["select", "eq", "in", "order", "limit"]) {
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

beforeEach(() => {
  enviarTextoMock.mockClear();
  enviarTextoMock.mockResolvedValue(undefined);
  enviarImagenPorLinkMock.mockClear();
  enviarImagenPorLinkMock.mockResolvedValue(undefined);
  getSupabaseMock.mockReset();
  vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => ({
    WHATSAPP_OWNER_NUMBERS: "573215879805,573102862373",
    NOTIFICAR_PEDIDO_SECRET: "secreto-del-trigger",
  } as Record<string, string>)[k]) } });
});

function peticion(table: string, record: Record<string, unknown>): Request {
  return new Request("https://x/notificar-pedido", {
    method: "POST",
    headers: { "x-notificar-pedido-secret": "secreto-del-trigger" },
    body: JSON.stringify({ type: "INSERT", table, record }),
  });
}

describe("handleRequest", () => {
  it("rechaza con 401 si el header secreto no coincide", async () => {
    getSupabaseMock.mockReturnValue(mockSupabaseDesdeTablas({}));
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/notificar-pedido", {
      method: "POST",
      headers: { "x-notificar-pedido-secret": "incorrecto" },
      body: JSON.stringify({ type: "INSERT", table: "orders", record: {} }),
    });

    const respuesta = await handleRequest(req);
    expect(respuesta.status).toBe(401);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("pedido nuevo (tienda): manda encabezado, una foto+valor por producto, y el resumen con metodo de pago y total -- a los dos duenos", async () => {
    const supabase = mockSupabaseDesdeTablas({
      order_items: {
        data: [
          { name_snapshot: "Pijama Rosa", qty: 1, line_total: 89900, image_id: "img-1", product_id: "prod-1" },
          { name_snapshot: "Bata Dorada", qty: 2, line_total: 240000, image_id: null, product_id: "prod-2" },
        ],
        error: null,
      },
      product_images: { data: [{ url: "https://x/img-1.jpg", is_primary: true }], error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion("orders", {
      id: "order-1", order_number: "ML-20261006-abc123", total: 329900, channel: "whatsapp", payment_method: "wompi",
    }));

    expect(respuesta.status).toBe(200);
    // encabezado amigable + referencia al pedido, a ambos duenos
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("nueva venta"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("ML-20261006-abc123"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573102862373", expect.stringContaining("nueva venta"));
    // primer item: con foto (image_id directo)
    expect(enviarImagenPorLinkMock).toHaveBeenCalledWith("573215879805", "https://x/img-1.jpg", expect.stringContaining("Pijama Rosa"));
    expect(enviarImagenPorLinkMock).toHaveBeenCalledWith("573215879805", "https://x/img-1.jpg", expect.stringContaining("$89.900"));
    // segundo item: sin image_id directo, cae a la foto principal por product_id -- pero product_images aqui solo tiene filas para la foto directa del mock generico (mismo resultado para toda query a esa tabla); igual debe mostrar cantidad y valor en el texto/caption
    expect(enviarImagenPorLinkMock.mock.calls.some(([, , caption]: [string, string, string]) => caption.includes("2x Bata Dorada") && caption.includes("$240.000"))).toBe(true);
    // resumen final: metodo de pago y total
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("wompi"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("$329.900"));
  });

  it("venta POS normal (sin credito): encabezado de POS, items con talla/color, metodo de pago y total pagado", async () => {
    const supabase = mockSupabaseDesdeTablas({
      pos_sale_items: {
        data: [{ product_id: "prod-1", variant_id: "var-1", qty: 1, line_total: 40000, image_id: null }],
        error: null,
      },
      products: { data: [{ id: "prod-1", name: "Camiseta Mariposa" }], error: null },
      product_variants: { data: [{ id: "var-1", talla: "M", color: "Rosa" }], error: null },
      product_images: { data: [{ url: "https://x/mariposa.jpg", is_primary: true }], error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion("pos_sales", {
      id: "venta-1", sale_number: "POS-001", total: 40000, payment_method: "efectivo", customer_id: null,
    }));

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("sistema POS"));
    expect(enviarImagenPorLinkMock).toHaveBeenCalledWith("573215879805", "https://x/mariposa.jpg", expect.stringContaining("Camiseta Mariposa"));
    expect(enviarImagenPorLinkMock).toHaveBeenCalledWith("573215879805", "https://x/mariposa.jpg", expect.stringContaining("Talla M"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("efectivo"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("$40.000"));
    expect(enviarTextoMock).not.toHaveBeenCalledWith("573215879805", expect.stringContaining("crédito"));
  });

  it("venta POS a credito con abono inicial: el resumen avisa que es a credito, el abono inicial y el saldo pendiente", async () => {
    const supabase = mockSupabaseDesdeTablas({
      pos_sale_items: { data: [{ product_id: "prod-1", variant_id: null, qty: 1, line_total: 200000, image_id: null }], error: null },
      products: { data: [{ id: "prod-1", name: "Bata Dorada" }], error: null },
      product_variants: { data: [], error: null },
      product_images: { data: [], error: null },
      pos_customers: { data: [{ id: "cli-1", profile_id: null, nombre: "Juan Pérez" }], error: null },
      credit_payments: { data: [{ amount: 50000 }], error: null },
      credit_installments: { data: [{ amount: 200000, paid_amount: 50000 }], error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    await handleRequest(peticion("pos_sales", {
      id: "venta-2", sale_number: "POS-002", total: 200000, payment_method: "credito", customer_id: "cli-1",
    }));

    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("Juan Pérez"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("crédito"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("Abono inicial: $50.000"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("Saldo pendiente: $150.000"));
  });

  it("abono a credito (credit_payments): avisa con el nombre del cliente, el monto, el producto y el saldo pendiente resultante", async () => {
    const supabase = mockSupabaseDesdeTablas({
      pos_sales: { data: [{ sale_number: "POS-003", customer_id: "cli-1" }], error: null },
      pos_customers: { data: [{ id: "cli-1", profile_id: null, nombre: "María López" }], error: null },
      pos_sale_items: { data: [{ product_id: "prod-1" }], error: null },
      products: { data: [{ name: "Camiseta Mariposa" }], error: null },
      credit_installments: { data: [{ amount: 100000, paid_amount: 60000 }], error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion("credit_payments", {
      sale_id: "venta-3", amount: 30000, payment_method: "efectivo",
    }));

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining('María López'));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("$30.000"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("Camiseta Mariposa"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("$40.000"));
    // no manda imagenes para el aviso de abono (no es una venta nueva con items a mostrar)
    expect(enviarImagenPorLinkMock).not.toHaveBeenCalled();
  });

  it("si la venta a la que pertenece el abono no existe, no revienta (no manda nada)", async () => {
    const supabase = mockSupabaseDesdeTablas({ pos_sales: { data: null, error: null } });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion("credit_payments", { sale_id: "venta-inexistente", amount: 10000, payment_method: "efectivo" }));

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("si el envio a un dueno falla, igual se intenta con el otro y se loguea el error", async () => {
    const razonFallo = new Error("no reachable");
    enviarTextoMock.mockImplementation((numero: string) => {
      if (numero === "573215879805") return Promise.reject(razonFallo);
      return Promise.resolve();
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const supabase = mockSupabaseDesdeTablas({
      pos_sale_items: { data: [], error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion("pos_sales", { id: "venta-4", sale_number: "POS-004", total: 1000, payment_method: "efectivo", customer_id: null }));

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.any(String));
    expect(enviarTextoMock).toHaveBeenCalledWith("573102862373", expect.any(String));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("573215879805"),
      razonFallo,
    );

    consoleErrorSpy.mockRestore();
  });
});
