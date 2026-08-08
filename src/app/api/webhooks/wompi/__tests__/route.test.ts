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
import { enviarCorreo } from "@/lib/email/resend";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

// Mockeado para que las pruebas nunca disparen una llamada de red real a
// Resend (que ocurriria si `RESEND_API_KEY` esta presente en el entorno de
// pruebas) y para poder verificar con quien/que asunto se intento enviar
// el correo de confirmacion.
vi.mock("@/lib/email/resend", () => ({
  enviarCorreo: vi.fn(),
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
  single: () => Promise<{ data?: unknown; error?: unknown }>;
  then: (
    resolve: (value: unknown) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

// Builder encadenable y "thenable" que imita lo suficiente del query
// builder de supabase-js para los caminos que usa el webhook:
// select().eq().eq().maybeSingle(), select().eq().single(),
// select().eq() (awaited directamente, sin metodo terminal, para
// order_items) y update().eq().eq().eq() (tambien awaited directamente).
function crearQueryBuilder(resultado: { data?: unknown; error?: unknown }) {
  const eq = vi.fn();
  const select = vi.fn();
  const update = vi.fn();
  const maybeSingle = vi.fn(() => Promise.resolve(resultado));
  const single = vi.fn(() => Promise.resolve(resultado));

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
  builder.single = single;
  builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
    Promise.resolve(resultado).then(resolve, reject);

  return { builder, eq, select, update, maybeSingle, single };
}

function crearAdminMock(opts: {
  selectResultado?: { data: unknown; error: unknown };
  updateResultado?: { data?: unknown; error: unknown };
  rpcResultado?: { data: unknown; error: unknown };
  // Resultado del segundo select a "orders" (Task 5: busqueda del pedido
  // completo tras confirmar el pago, via .single()). Por defecto ausente
  // (`data: null`) para que las pruebas existentes -- que no conocen este
  // camino nuevo -- no disparen el envio de correo ni necesiten mockear
  // `auth.admin.getUserById`/`order_items`.
  pedidoCompletoResultado?: { data: unknown; error?: unknown };
  usuarioResultado?: { data: { user: { email?: string } | null }; error?: unknown };
  itemsResultado?: { data: unknown; error?: unknown };
} = {}) {
  const selectQuery = crearQueryBuilder(opts.selectResultado ?? { data: null, error: null });
  const updateQuery = crearQueryBuilder(opts.updateResultado ?? { data: null, error: null });
  const pedidoCompletoQuery = crearQueryBuilder(
    opts.pedidoCompletoResultado ?? { data: null, error: null },
  );
  const itemsQuery = crearQueryBuilder(opts.itemsResultado ?? { data: [], error: null });

  // Cuenta cuantas veces se invoca select() sobre "orders": la primera es
  // siempre la busqueda original (select().eq().eq().maybeSingle()); la
  // segunda en adelante es la busqueda del pedido completo que agrego la
  // Task 5 (select().eq().single()).
  let selectsSobreOrders = 0;

  const from = vi.fn((tabla: string) => {
    if (tabla === "order_items") {
      return {
        select: (...args: unknown[]) => itemsQuery.builder.select(...args),
      };
    }
    // tabla === "orders"
    return {
      select: (...args: unknown[]) => {
        selectsSobreOrders += 1;
        return selectsSobreOrders === 1
          ? selectQuery.builder.select(...args)
          : pedidoCompletoQuery.builder.select(...args);
      },
      update: (...args: unknown[]) => updateQuery.builder.update(...args),
    };
  });

  const rpc = vi.fn(() => Promise.resolve(opts.rpcResultado ?? { data: null, error: null }));

  const getUserById = vi.fn(() =>
    Promise.resolve(opts.usuarioResultado ?? { data: { user: null }, error: null }),
  );
  const auth = { admin: { getUserById } };

  return { from, rpc, auth, selectQuery, updateQuery, pedidoCompletoQuery, itemsQuery };
}

describe("POST /api/webhooks/wompi", () => {
  beforeEach(() => {
    vi.stubEnv("WOMPI_EVENTS_SECRET", SECRET);
    vi.mocked(createAdminClient).mockReset();
    vi.mocked(enviarCorreo).mockReset();
    vi.mocked(enviarCorreo).mockResolvedValue({ id: "email-test-id" });
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

  it("APPROVED con error al ejecutar la RPC de confirmacion: registra el error (incluyendo referencia y transaccion), responde 200 y NO envia correo de confirmacion", async () => {
    const errorRpc = { message: "el pedido no esta en un estado valido para confirmar el pago" };
    const admin = crearAdminMock({
      selectResultado: { data: { id: "order-uuid-1", total: 44900, status: "pendiente" }, error: null },
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

    // Una confirmacion de pago fallida (RPC con error) nunca debe generar
    // un correo diciendole al cliente que su pedido quedo pagado: se
    // verifica que el camino de envio ni siquiera se entra (no se busca al
    // usuario) y que `enviarCorreo` jamas se invoca.
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("APPROVED con pago recien confirmado (el pedido estaba 'pendiente' antes de esta llamada): envia el correo de confirmacion al cliente", async () => {
    const admin = crearAdminMock({
      selectResultado: { data: { id: "order-uuid-1", total: 44900, status: "pendiente" }, error: null },
      rpcResultado: { data: { id: "order-uuid-1", status: "pagado" }, error: null },
      pedidoCompletoResultado: {
        data: {
          id: "order-uuid-1",
          order_number: "ML-20260807-abc123",
          total: 44900,
          payment_method: "wompi",
          user_id: "user-uuid-1",
          shipping_address: { fullName: "Mery Lay", address: "Calle 1 # 2-3", city: "Bogotá" },
        },
        error: null,
      },
      usuarioResultado: { data: { user: { email: "cliente@example.com" } }, error: null },
      itemsResultado: {
        data: [{ name_snapshot: "Pijama Rosa Talla M", qty: 2, line_total: 44900 }],
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento({ transaccion: { amount_in_cents: 4490000 } });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    expect(admin.auth.admin.getUserById).toHaveBeenCalledWith("user-uuid-1");
    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    expect(enviarCorreo).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "cliente@example.com",
        subject: expect.stringContaining("ML-20260807-abc123"),
      }),
    );
    // Este correo SI puede afirmar que el pedido quedo confirmado: solo se
    // dispara tras un APPROVED que en verdad transiciono el pedido a pagado.
    // La variante "recibido" (checkout manual, pedido aun sin pagar) nunca
    // debe llegar por este camino.
    const [argumentos] = vi.mocked(enviarCorreo).mock.calls[0];
    expect(argumentos.subject).toMatch(/confirmaci/i);
    expect(argumentos.react.props).toEqual(
      expect.objectContaining({ variante: "pagado" }),
    );
  });

  it("APPROVED de un evento repetido/reenviado (el pedido ya estaba 'pagado' antes de esta llamada): NO reenvia un segundo correo de confirmacion", async () => {
    // confirm_order_payment_wompi es idempotente: si el pedido ya esta
    // 'pagado', retorna la fila sin error (para tolerar reenvios de Wompi
    // dentro de la ventana de replay, o reintentos de red). Sin el chequeo
    // de que el pedido en verdad estaba 'pendiente' ANTES de esta llamada,
    // este escenario le mandaria al cliente un segundo correo duplicado
    // por un pago que ya habia sido notificado.
    // OJO: `pedidoCompletoResultado`/`usuarioResultado`/`itemsResultado` se
    // rellenan con datos completos y validos a proposito (en vez de dejar
    // los defaults `null` de `crearAdminMock`) -- si se dejaran vacios, el
    // guard `if (pedidoCompleto)` bloquearia el envio de correo por si
    // solo, y este test "pasaria" sin ejercer en realidad el chequeo de
    // `pedido.status === "pendiente"` que es lo que se quiere probar aqui.
    const admin = crearAdminMock({
      selectResultado: { data: { id: "order-uuid-1", total: 44900, status: "pagado" }, error: null },
      rpcResultado: { data: { id: "order-uuid-1", status: "pagado" }, error: null },
      pedidoCompletoResultado: {
        data: {
          id: "order-uuid-1",
          order_number: "ML-20260807-abc123",
          total: 44900,
          payment_method: "wompi",
          user_id: "user-uuid-1",
          shipping_address: { fullName: "Mery Lay", address: "Calle 1 # 2-3", city: "Bogotá" },
        },
        error: null,
      },
      usuarioResultado: { data: { user: { email: "cliente@example.com" } }, error: null },
      itemsResultado: {
        data: [{ name_snapshot: "Pijama Rosa Talla M", qty: 2, line_total: 44900 }],
        error: null,
      },
    });
    vi.mocked(createAdminClient).mockReturnValue(admin as never);

    const { POST } = await import("../route");
    const evento = construirEvento({ transaccion: { amount_in_cents: 4490000 } });
    const response = await POST(crearRequest(evento));

    expect(response.status).toBe(200);
    // La RPC igual se invoca (es responsabilidad suya decidir que no hay
    // nada que hacer); lo que se verifica es que, pese a no haber
    // `errorRpc` y pese a que la busqueda del pedido completo (si se
    // llegara a ejecutar) devolveria datos utilizables, no se dispara el
    // correo para un pedido que ya estaba pagado antes de esta llamada.
    expect(admin.rpc).toHaveBeenCalled();
    expect(admin.auth.admin.getUserById).not.toHaveBeenCalled();
    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it(
    "APPROVED con un fallo inesperado al preparar el correo: responde 200 igualmente " +
      "(el pago YA quedo confirmado; un 500 haria a Wompi reintentar un evento ya procesado)",
    async () => {
      const admin = crearAdminMock({
        selectResultado: { data: { id: "order-uuid-1", total: 44900, status: "pendiente" }, error: null },
        rpcResultado: { data: { id: "order-uuid-1", status: "pagado" }, error: null },
        pedidoCompletoResultado: {
          data: {
            id: "order-uuid-1",
            order_number: "ML-20260807-abc123",
            total: 44900,
            payment_method: "wompi",
            user_id: "user-uuid-1",
            shipping_address: null,
          },
          error: null,
        },
      });
      // Las consultas extra que solo existen para armar el correo pueden
      // lanzar ante fallos inesperados de supabase-js, no solo devolver
      // `{error}`. Sin el try/catch alrededor del bloque, esto se convertiria
      // en un 500 y Wompi reintentaria un pago que ya se confirmo.
      admin.auth.admin.getUserById.mockRejectedValue(new Error("fallo inesperado de red"));
      vi.mocked(createAdminClient).mockReturnValue(admin as never);

      const { POST } = await import("../route");
      const evento = construirEvento({ transaccion: { amount_in_cents: 4490000 } });
      const response = await POST(crearRequest(evento));

      expect(response.status).toBe(200);
      expect(admin.rpc).toHaveBeenCalledWith("confirm_order_payment_wompi", {
        p_order_id: "order-uuid-1",
        p_wompi_transaction_id: "txn-123",
      });
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining("[email]"),
        expect.any(Error),
      );
    },
  );

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
