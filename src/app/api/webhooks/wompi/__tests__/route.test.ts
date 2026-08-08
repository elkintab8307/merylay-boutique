// @vitest-environment node
//
// Se fuerza el entorno "node" (en vez del "jsdom" global del proyecto)
// porque este archivo ejercita un Route Handler real de Next.js, que
// espera las APIs web estandar (Request/Response) tal como las expone
// Node, no las que jsdom simula para pruebas de DOM.
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const SECRET = "test_events_secret";
const PROPIEDADES_ESPERADAS = ["transaction.id", "transaction.status", "transaction.amount_in_cents"];

type Transaccion = {
  id: string;
  reference: string;
  status: string;
  amount_in_cents: number;
};

function firmar(transaccion: Transaccion, timestamp: number, secret = SECRET): string {
  const valores = [transaccion.id, transaccion.status, String(transaccion.amount_in_cents)];
  const cadena = `${valores.join("")}${timestamp}${secret}`;
  return createHash("sha256").update(cadena).digest("hex");
}

function construirEvento(overrides: {
  transaccion?: Partial<Transaccion>;
  timestamp?: number;
  properties?: string[];
  checksum?: string;
  secretoParaFirmar?: string;
} = {}) {
  const transaccion: Transaccion = {
    id: "txn-123",
    reference: "ML-20260807-abc123",
    status: "APPROVED",
    amount_in_cents: 4490000,
    ...overrides.transaccion,
  };
  const timestamp = overrides.timestamp ?? Math.floor(Date.now() / 1000);
  const properties = overrides.properties ?? PROPIEDADES_ESPERADAS;
  const checksum =
    overrides.checksum ?? firmar(transaccion, timestamp, overrides.secretoParaFirmar ?? SECRET);

  return {
    event: "transaction.updated",
    data: { transaction: transaccion },
    signature: { properties, checksum },
    timestamp,
  };
}

function crearRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/wompi", {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

type QueryBuilder = {
  select: (...args: unknown[]) => QueryBuilder;
  update: (...args: unknown[]) => QueryBuilder;
  eq: (...args: unknown[]) => QueryBuilder;
  maybeSingle: () => Promise<{ data?: unknown; error?: unknown }>;
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

// Builder encadenable y "thenable" que imita lo suficiente del query
// builder de supabase-js para los dos caminos que usa el webhook:
// select().eq().eq().maybeSingle() y update().eq().eq().eq() (awaited
// directamente, sin metodo terminal explicito).
function crearQueryBuilder(resultado: { data?: unknown; error?: unknown }) {
  const eq = vi.fn();
  const select = vi.fn();
  const update = vi.fn();
  const maybeSingle = vi.fn(() => Promise.resolve(resultado));

  const builder = {} as QueryBuilder;
  builder.select = vi.fn((...args: unknown[]) => {
    select(...args);
    return builder;
  });
  builder.update = vi.fn((...args: unknown[]) => {
    update(...args);
    return builder;
  });
  builder.eq = vi.fn((...args: unknown[]) => {
    eq(...args);
    return builder;
  });
  builder.maybeSingle = maybeSingle;
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(resultado).then(resolve, reject);

  return { builder, eq, select, update, maybeSingle };
}

function crearAdminMock(opts: {
  selectResultado?: { data: unknown; error: unknown };
  updateResultado?: { data?: unknown; error: unknown };
  rpcResultado?: { data: unknown; error: unknown };
} = {}) {
  const selectQuery = crearQueryBuilder(opts.selectResultado ?? { data: null, error: null });
  const updateQuery = crearQueryBuilder(opts.updateResultado ?? { data: null, error: null });

  const from = vi.fn((tabla: string) => {
    void tabla;
    // Ambos caminos (select y update) comparten la misma tabla "orders" en
    // este webhook, asi que se distingue por cual metodo se invoca despues.
    return {
      select: (...args: unknown[]) => selectQuery.builder.select(...args),
      update: (...args: unknown[]) => updateQuery.builder.update(...args),
    };
  });

  const rpc = vi.fn(() => Promise.resolve(opts.rpcResultado ?? { data: null, error: null }));

  return { from, rpc, selectQuery, updateQuery };
}

describe("POST /api/webhooks/wompi", () => {
  beforeEach(() => {
    vi.stubEnv("WOMPI_EVENTS_SECRET", SECRET);
    vi.mocked(createAdminClient).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("responde 500 y no verifica nada si WOMPI_EVENTS_SECRET no esta configurado (fail-closed, no fail-open)", async () => {
    // Si el guard no existiera, `process.env.WOMPI_EVENTS_SECRET` seria
    // `undefined` y se interpolaria como el string literal "undefined" en
    // el hash de verificarFirmaEvento -- cualquiera podria calcular un
    // checksum valido usando "undefined" como secreto y forjar eventos
    // APPROVED. Este test confirma que, en cambio, un secreto ausente
    // rechaza todo de inmediato, sin tocar el cuerpo, la firma ni la BD.
    vi.stubEnv("WOMPI_EVENTS_SECRET", "");

    const admin = crearAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento();
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(500);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("WOMPI_EVENTS_SECRET"),
    );
  });

  it("responde 400 si el cuerpo no es JSON valido", async () => {
    const { POST } = await import("../route");
    const response = await POST(crearRequest("esto no es json"));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("responde 400 si el cuerpo es JSON pero le faltan los campos requeridos (data.transaction vacio)", async () => {
    const { POST } = await import("../route");
    const cuerpoInvalido = {
      data: {},
      signature: { properties: PROPIEDADES_ESPERADAS, checksum: "x".repeat(64) },
      timestamp: Math.floor(Date.now() / 1000),
    };
    const response = await POST(crearRequest(cuerpoInvalido));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("registra el rechazo cuando el esquema no valida (un webhook que rechaza en silencio es invisible hasta que un cliente reclama)", async () => {
    const { POST } = await import("../route");
    const cuerpoInvalido = {
      data: {},
      signature: { properties: PROPIEDADES_ESPERADAS, checksum: "x".repeat(64) },
      timestamp: Math.floor(Date.now() / 1000),
    };
    const response = await POST(crearRequest(cuerpoInvalido));

    expect(response.status).toBe(400);
    // No hay `reference` legible en un cuerpo que ni siquiera valida, asi que
    // se exige al menos una traza diagnostica con el prefijo del webhook.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[webhook wompi]"),
      expect.anything(),
    );
  });

  it("registra el rechazo cuando signature.properties no coincide con la lista fijada, incluyendo la referencia", async () => {
    const { POST } = await import("../route");
    const evento = construirEvento({ properties: ["transaction.id"] });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(400);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(evento.data.transaction.reference),
    );
  });

  it("registra el rechazo cuando el checksum es invalido, incluyendo la referencia", async () => {
    const { POST } = await import("../route");
    const evento = construirEvento({ checksum: "0".repeat(64) });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(401);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(evento.data.transaction.reference),
    );
  });

  it("ignora (200, sin error registrado) los eventos de Wompi que no son transaction.updated", async () => {
    // Wompi envia otros tipos de evento a la misma URL; su `data` tiene otra
    // forma y no validaria contra el esquema. Devolver 400 y registrarlos
    // como "formato invalido" seria ruido, ademas de inducir reintentos.
    const admin = crearAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const response = await POST(
      crearRequest({
        event: "nequi_token.updated",
        data: { nequi_token: { status: "APPROVED" } },
        sent_at: new Date().toISOString(),
      }),
    );

    expect(response.status).toBe(200);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
  });

  it("responde 400 (y no revienta con un TypeError/500) si signature.properties llega con el tipo incorrecto (string en vez de array)", async () => {
    const { POST } = await import("../route");
    const evento = construirEvento();
    const cuerpoInvalido = {
      ...evento,
      signature: { ...evento.signature, properties: "transaction.id" },
    };
    const response = await POST(crearRequest(cuerpoInvalido));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("responde 400 (y no revienta con un TypeError/500) si signature.properties es null en vez de un array", async () => {
    // A diferencia del caso de arriba (string), aqui el guard de longitud
    // del pinning (`properties.length === PROPIEDADES_ESPERADAS.length`)
    // por si solo NO protege: `null.length` lanza un TypeError antes de
    // llegar siquiera a comparar longitudes. Este caso aisla especificamente
    // la proteccion que aporta el esquema zod (Important 1+4), que ninguno
    // de los otros dos tests de esta suite ejercita.
    const { POST } = await import("../route");
    const evento = construirEvento();
    const cuerpoInvalido = {
      ...evento,
      signature: { ...evento.signature, properties: null },
    };
    const response = await POST(crearRequest(cuerpoInvalido));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("responde 400 si signature.properties no coincide con la lista esperada, antes de verificar la firma", async () => {
    const { POST } = await import("../route");
    const evento = construirEvento({ properties: ["transaction.id"] });
    const response = await POST(crearRequest(evento));
    expect(response.status).toBe(400);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it("responde 401 si el checksum es incorrecto, y no llama a ningun metodo de Supabase", async () => {
    const admin = crearAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento({ checksum: "0".repeat(64) });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("APPROVED con pedido encontrado y monto correcto: llama la RPC con los argumentos correctos", async () => {
    const admin = crearAdminMock({
      selectResultado: { data: { id: "order-uuid-1", total: 44900 }, error: null },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento({
      transaccion: { amount_in_cents: 4490000 },
    });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalledWith("confirm_order_payment_wompi", {
      p_order_id: "order-uuid-1",
      p_wompi_transaction_id: "txn-123",
    });
    const llamadasEqBusqueda = admin.selectQuery.eq.mock.calls;
    expect(llamadasEqBusqueda).toContainEqual(["order_number", "ML-20260807-abc123"]);
    expect(llamadasEqBusqueda).toContainEqual(["payment_method", "wompi"]);
  });

  it("APPROVED con monto que no coincide con el total del pedido: NO llama la RPC", async () => {
    const admin = crearAdminMock({
      selectResultado: { data: { id: "order-uuid-1", total: 999 }, error: null },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento({
      transaccion: { amount_in_cents: 4490000 },
    });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("DECLINED: actualiza con el filtro status='pendiente' presente en la llamada", async () => {
    const admin = crearAdminMock({
      updateResultado: { error: null },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento({
      transaccion: { status: "DECLINED" },
    });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    expect(admin.updateQuery.update).toHaveBeenCalledWith({ status: "cancelado" });
    const llamadasEq = admin.updateQuery.eq.mock.calls;
    expect(llamadasEq).toContainEqual(["status", "pendiente"]);
    expect(llamadasEq).toContainEqual(["order_number", "ML-20260807-abc123"]);
    expect(llamadasEq).toContainEqual(["payment_method", "wompi"]);
  });

  it("PENDING (estado no reconocido como aprobado ni cancelado): responde 200 sin tocar la base de datos", async () => {
    const admin = crearAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento({ transaccion: { status: "PENDING" } });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    expect(admin.from).not.toHaveBeenCalled();
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it("responde 200 (no 400) si el timestamp esta fuera de la ventana de tolerancia, y registra el evento expirado", async () => {
    // 200 y no 400: Wompi reenvia el mismo payload original (mismo
    // timestamp) en cada reintento, asi que un timestamp ya expirado nunca
    // se vuelve valido al reintentar. Devolver 400 aqui produciria un loop
    // de reintentos permanente para un evento que jamas va a resolverse.
    const admin = crearAdminMock();
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const timestampViejo = Math.floor(Date.now() / 1000) - 10_000;
    const evento = construirEvento({ timestamp: timestampViejo });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    expect(admin.from).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(evento.data.transaction.reference),
    );
  });

  it("APPROVED con error de Supabase al buscar el pedido: registra el error y aun asi responde 200 (para que Wompi no reintente indefinidamente)", async () => {
    const errorBusqueda = { message: "conexion perdida" };
    const admin = crearAdminMock({
      selectResultado: { data: null, error: errorBusqueda },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento();
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    expect(admin.rpc).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(evento.data.transaction.reference),
      errorBusqueda,
    );
  });

  it("APPROVED con error al ejecutar la RPC de confirmacion: registra el error (incluyendo referencia y transaccion) y responde 200", async () => {
    const errorRpc = { message: "el pedido no esta en un estado valido para confirmar el pago" };
    const admin = crearAdminMock({
      selectResultado: { data: { id: "order-uuid-1", total: 44900 }, error: null },
      rpcResultado: { data: null, error: errorRpc },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento({ transaccion: { amount_in_cents: 4490000 } });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    expect(admin.rpc).toHaveBeenCalled();
    const llamadaLog = vi.mocked(console.error).mock.calls.find(([mensaje]) =>
      typeof mensaje === "string" && mensaje.includes(evento.data.transaction.id),
    );
    expect(llamadaLog).toBeDefined();
    expect(llamadaLog?.[0]).toContain(evento.data.transaction.reference);
    expect(llamadaLog?.[1]).toBe(errorRpc);
  });

  it("DECLINED con error de Supabase al actualizar: registra el error (incluyendo referencia y transaccion) y responde 200", async () => {
    const errorUpdate = { message: "timeout" };
    const admin = crearAdminMock({
      updateResultado: { error: errorUpdate },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento({ transaccion: { status: "DECLINED" } });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(evento.data.transaction.reference),
      errorUpdate,
    );
  });
});
