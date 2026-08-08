// @vitest-environment node
//
// Se fuerza el entorno "node" (en vez del "jsdom" global del proyecto)
// porque estas son Server Actions: solo ejercitan logica de servidor
// (variables de entorno, cliente de Supabase, firma de integridad) y no
// necesitan ni el DOM ni las globals que jsdom simula.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { calcularFirmaIntegridad } from "@/lib/wompi/signature";
import type { CheckoutInput } from "@/lib/validation/checkout";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

const SECRETO_INTEGRIDAD = "test_integrity_secret";
const LLAVE_PUBLICA = "pub_test_llave";

const DATOS_CHECKOUT: CheckoutInput = {
  fullName: "Mery Lay",
  phone: "3001234567",
  address: "Calle 123 #45-67",
  city: "Bogotá",
  notes: "Timbre 2",
  paymentMethod: "wompi",
};

const PEDIDO_PENDIENTE = {
  id: "order-uuid-1",
  order_number: "ML-20260807-abc123",
  total: 44900,
  status: "pendiente",
  payment_method: "wompi",
};

function crearSupabaseMock(opts: {
  rpcResultado?: { data: unknown; error: unknown };
  usuario?: { id: string } | null;
  pedidoResultado?: { data: unknown; error: unknown };
} = {}) {
  const rpc = vi.fn(() =>
    Promise.resolve(opts.rpcResultado ?? { data: PEDIDO_PENDIENTE, error: null }),
  );

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

  return { rpc, from, eq, select, maybeSingle, auth: { getUser }, getUser };
}

describe("iniciarPagoWompi", () => {
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

  it("crea el pedido y devuelve la firma de integridad calculada con el secreto configurado", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { iniciarPagoWompi } = await import("../wompi-actions");
    const resultado = await iniciarPagoWompi(DATOS_CHECKOUT);

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
    expect(supabase.rpc).toHaveBeenCalledWith("create_order_wompi", expect.anything());
  });

  it("rechaza cualquier metodo de pago que no sea wompi, sin crear el pedido", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { iniciarPagoWompi } = await import("../wompi-actions");
    const resultado = await iniciarPagoWompi({ ...DATOS_CHECKOUT, paymentMethod: "efectivo" });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("falla cerrado y NO crea el pedido si falta WOMPI_INTEGRITY_SECRET", async () => {
    // Sin este guard, `process.env.WOMPI_INTEGRITY_SECRET!` seria `undefined`
    // y se interpolaria como el string literal "undefined" en el hash de
    // `calcularFirmaIntegridad`: se devolveria una firma basura que Wompi
    // rechazaria. Peor aun, eso ocurriria DESPUES de que create_order_wompi
    // ya vacio el carrito del cliente, dejandolo sin carrito y con un pedido
    // pendiente imposible de pagar. El guard va antes de la RPC.
    vi.stubEnv("WOMPI_INTEGRITY_SECRET", "");

    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { iniciarPagoWompi } = await import("../wompi-actions");
    const resultado = await iniciarPagoWompi(DATOS_CHECKOUT);

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("WOMPI_INTEGRITY_SECRET"),
    );
  });

  it("falla cerrado y NO crea el pedido si falta WOMPI_PUBLIC_KEY", async () => {
    vi.stubEnv("WOMPI_PUBLIC_KEY", "");

    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { iniciarPagoWompi } = await import("../wompi-actions");
    const resultado = await iniciarPagoWompi(DATOS_CHECKOUT);

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("WOMPI_PUBLIC_KEY"));
  });
});
