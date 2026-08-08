// @vitest-environment node
//
// Entorno "node": esta Server Action solo ejercita logica de servidor
// (sesion, lectura del pedido y firma de integridad), sin DOM.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { calcularFirmaIntegridad } from "@/lib/wompi/signature";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const SECRETO_INTEGRIDAD = "test_integrity_secret";
const LLAVE_PUBLICA = "pub_test_llave";

const PEDIDO_PENDIENTE = {
  id: "order-uuid-1",
  order_number: "ML-20260807-abc123",
  total: 44900,
};

function crearSupabaseMock(opts: {
  usuario?: { id: string } | null;
  pedidoResultado?: { data: unknown; error: unknown };
} = {}) {
  const rpc = vi.fn(() => Promise.resolve({ data: null, error: null }));
  const maybeSingle = vi.fn(() =>
    Promise.resolve(opts.pedidoResultado ?? { data: PEDIDO_PENDIENTE, error: null }),
  );
  const eq = vi.fn();
  const select = vi.fn();

  const builder: Record<string, unknown> = {};
  builder.select = vi.fn((...args: unknown[]) => {
    select(...args);
    return builder;
  });
  builder.eq = vi.fn((...args: unknown[]) => {
    eq(...args);
    return builder;
  });
  builder.maybeSingle = maybeSingle;

  const from = vi.fn(() => builder);
  const getUser = vi.fn(() =>
    Promise.resolve({
      data: { user: opts.usuario === undefined ? { id: "user-uuid-1" } : opts.usuario },
      error: null,
    }),
  );

  return { rpc, from, eq, select, maybeSingle, auth: { getUser } };
}

describe("reintentarPagoWompi", () => {
  beforeEach(() => {
    vi.stubEnv("WOMPI_INTEGRITY_SECRET", SECRETO_INTEGRIDAD);
    vi.stubEnv("WOMPI_PUBLIC_KEY", LLAVE_PUBLICA);
    vi.mocked(createClient).mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("devuelve la MISMA firma que iniciarPagoWompi para el pedido existente (misma referencia y monto)", async () => {
    // Al reusar referencia y monto, Wompi trata el reintento como el mismo
    // pago: no se crea un pedido nuevo y el webhook resuelve igual que hoy.
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reintentarPagoWompi } = await import("../wompi-actions");
    const resultado = await reintentarPagoWompi("order-uuid-1");

    expect(resultado).toEqual({
      orderId: "order-uuid-1",
      reference: "ML-20260807-abc123",
      amountInCents: 4490000,
      currency: "COP",
      publicKey: LLAVE_PUBLICA,
      signature: calcularFirmaIntegridad(
        "ML-20260807-abc123",
        4490000,
        "COP",
        SECRETO_INTEGRIDAD,
      ),
    });
    // No se crea nada: solo se lee el pedido existente.
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("acota la consulta al pedido del usuario autenticado, pendiente y con metodo wompi", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reintentarPagoWompi } = await import("../wompi-actions");
    await reintentarPagoWompi("order-uuid-1");

    const llamadasEq = supabase.eq.mock.calls;
    expect(llamadasEq).toContainEqual(["id", "order-uuid-1"]);
    expect(llamadasEq).toContainEqual(["user_id", "user-uuid-1"]);
    expect(llamadasEq).toContainEqual(["status", "pendiente"]);
    expect(llamadasEq).toContainEqual(["payment_method", "wompi"]);
  });

  it("rechaza si no hay sesion iniciada, sin consultar el pedido", async () => {
    const supabase = crearSupabaseMock({ usuario: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reintentarPagoWompi } = await import("../wompi-actions");
    const resultado = await reintentarPagoWompi("order-uuid-1");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rechaza si el pedido no existe, no es del usuario, no esta pendiente o no es de Wompi", async () => {
    // Los cuatro casos colapsan en el mismo resultado: la consulta filtra por
    // id + user_id + status + payment_method, asi que cualquiera de ellos
    // devuelve `null` y se responde con el mismo mensaje (sin filtrar si el
    // pedido existe o no).
    const supabase = crearSupabaseMock({ pedidoResultado: { data: null, error: null } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reintentarPagoWompi } = await import("../wompi-actions");
    const resultado = await reintentarPagoWompi("order-uuid-1");

    expect(resultado).toEqual({ error: expect.any(String) });
  });

  it("rechaza si Supabase devuelve error al leer el pedido", async () => {
    const supabase = crearSupabaseMock({
      pedidoResultado: { data: null, error: { message: "conexion perdida" } },
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reintentarPagoWompi } = await import("../wompi-actions");
    const resultado = await reintentarPagoWompi("order-uuid-1");

    expect(resultado).toEqual({ error: expect.any(String) });
  });

  it("falla cerrado si falta WOMPI_INTEGRITY_SECRET, sin consultar el pedido", async () => {
    vi.stubEnv("WOMPI_INTEGRITY_SECRET", "");

    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { reintentarPagoWompi } = await import("../wompi-actions");
    const resultado = await reintentarPagoWompi("order-uuid-1");

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("WOMPI_INTEGRITY_SECRET"),
    );
  });
});
