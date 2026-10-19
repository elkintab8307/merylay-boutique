import { beforeEach, describe, expect, it, vi } from "vitest";

const enviarTextoMock = vi.hoisted(() => vi.fn());
vi.mock("../_shared/meta.ts", () => ({ enviarTexto: enviarTextoMock }));

const getSupabaseMock = vi.hoisted(() => vi.fn());
vi.mock("../_shared/db.ts", () => ({ getSupabase: getSupabaseMock }));

const SECRET = "secreto-confirmar-pago-whatsapp";

// Mock generico: cada tabla tiene una respuesta fija {data, error} que se
// devuelve sin importar los filtros encadenados (select/eq) -- mismo patron
// usado en notificar-pedido/index.test.ts.
function mockSupabaseDesdeTablas(porTabla: Record<string, { data: unknown; error?: unknown }>) {
  const from = vi.fn((tabla: string) => {
    const resultado = porTabla[tabla] ?? { data: [], error: null };
    const query: Record<string, unknown> = {};
    for (const metodo of ["select", "eq"]) {
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
  getSupabaseMock.mockReset();
  vi.stubGlobal("Deno", {
    env: {
      get: vi.fn(
        (k: string) =>
          ({ CONFIRMAR_PAGO_WHATSAPP_SECRET: SECRET } as Record<string, string>)[k],
      ),
    },
  });
});

function peticion(body: unknown, secreto = SECRET): Request {
  return new Request("https://x/confirmar-pago-whatsapp", {
    method: "POST",
    headers: { "x-confirmar-pago-whatsapp-secret": secreto },
    body: JSON.stringify(body),
  });
}

describe("handleRequest", () => {
  it("rechaza con 401 si el header secreto no coincide", async () => {
    getSupabaseMock.mockReturnValue(mockSupabaseDesdeTablas({}));
    const { handleRequest } = await import("./index.ts");

    const respuesta = await handleRequest(peticion({ orderId: "order-1" }, "incorrecto"));

    expect(respuesta.status).toBe(401);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("responde 400 si falta orderId", async () => {
    getSupabaseMock.mockReturnValue(mockSupabaseDesdeTablas({}));
    const { handleRequest } = await import("./index.ts");

    const respuesta = await handleRequest(peticion({}));

    expect(respuesta.status).toBe(400);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("pedido de whatsapp pagado: envia el mensaje de confirmacion al numero del perfil", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: {
        data: {
          id: "order-1",
          order_number: "ML-20261018-abc123",
          total: 89900,
          status: "pagado",
          channel: "whatsapp",
          user_id: "user-1",
        },
        error: null,
      },
      profiles: { data: { whatsapp: "+57 300 123 4567" }, error: null },
      order_items: {
        data: [{ name_snapshot: "Pijama Rosa Talla M", qty: 2, line_total: 89900 }],
        error: null,
      },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion({ orderId: "order-1" }));

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).toHaveBeenCalledTimes(1);
    const [numero, mensaje] = enviarTextoMock.mock.calls[0];
    expect(numero).toBe("573001234567");
    expect(mensaje).toContain("ML-20261018-abc123");
    expect(mensaje).toContain("2x Pijama Rosa Talla M");
    expect(mensaje).toContain("$89.900");
  });

  it("pedido que no es de canal whatsapp: no envia nada (defensivo ante un llamador equivocado)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: {
        data: {
          id: "order-1",
          order_number: "ML-1",
          total: 1000,
          status: "pagado",
          channel: "web",
          user_id: "user-1",
        },
        error: null,
      },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion({ orderId: "order-1" }));

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("pedido de whatsapp pero aun no pagado: no envia nada (defensivo: solo confirma pagos reales)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: {
        data: {
          id: "order-1",
          order_number: "ML-1",
          total: 1000,
          status: "pendiente",
          channel: "whatsapp",
          user_id: "user-1",
        },
        error: null,
      },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion({ orderId: "order-1" }));

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("pedido inexistente: responde 200 sin lanzar", async () => {
    const supabase = mockSupabaseDesdeTablas({ orders: { data: null, error: null } });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion({ orderId: "order-inexistente" }));

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("perfil sin numero de whatsapp registrado: no envia nada", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: {
        data: {
          id: "order-1",
          order_number: "ML-1",
          total: 1000,
          status: "pagado",
          channel: "whatsapp",
          user_id: "user-1",
        },
        error: null,
      },
      profiles: { data: { whatsapp: null }, error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion({ orderId: "order-1" }));

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("fallo inesperado al enviar el mensaje: responde 200 igualmente (el pago ya esta confirmado en la base de datos)", async () => {
    const supabase = mockSupabaseDesdeTablas({
      orders: {
        data: {
          id: "order-1",
          order_number: "ML-1",
          total: 1000,
          status: "pagado",
          channel: "whatsapp",
          user_id: "user-1",
        },
        error: null,
      },
      profiles: { data: { whatsapp: "3001234567" }, error: null },
      order_items: { data: [], error: null },
    });
    getSupabaseMock.mockReturnValue(supabase);
    enviarTextoMock.mockRejectedValue(new Error("Graph API rechazo el envio"));

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion({ orderId: "order-1" }));

    expect(respuesta.status).toBe(200);
  });
});
