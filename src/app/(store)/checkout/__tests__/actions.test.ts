// @vitest-environment node
//
// Entorno "node": esta Server Action solo ejercita logica de servidor
// (validacion + cliente de Supabase), no necesita el DOM de jsdom.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enviarCorreo } from "@/lib/email/resend";
import { ConfirmacionPedidoEmail } from "@/lib/email/templates/confirmacion-pedido-email";
import type { CheckoutInput } from "@/lib/validation/checkout";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

// Mockeado para que las pruebas nunca disparen una llamada de red real a
// Resend (que ocurriria si `RESEND_API_KEY` esta presente en el entorno de
// pruebas) y para poder verificar a quien/con que asunto se envia el correo.
// Mismo patron que `api/webhooks/wompi/__tests__/route.test.ts`.
vi.mock("@/lib/email/resend", () => ({
  enviarCorreo: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));

const DATOS_CHECKOUT: CheckoutInput = {
  fullName: "Mery Lay",
  phone: "3001234567",
  address: "Calle 123 #45-67",
  city: "Bogotá",
  notes: "Timbre 2",
  paymentMethod: "transferencia",
};

// Builder encadenable y "thenable" que imita lo justo del query builder de
// supabase-js para el unico camino que usa esta accion:
// from("order_items").select(...).eq(...) esperado directamente, sin metodo
// terminal.
function crearQueryBuilder(resultado: { data?: unknown; error?: unknown }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(resultado).then(resolve, reject),
  };
  return builder;
}

function crearSupabaseMock(
  opts: {
    // Por defecto no hay usuario autenticado: el bloque del correo
    // (`if (user?.email)`) se omite y los tests que solo verifican el guard de
    // "wompi" o la validacion no necesitan mockear `order_items`. Los tests de
    // correo pasan un usuario explicito.
    usuario?: { email?: string } | null;
    getUserImpl?: () => Promise<unknown>;
    itemsResultado?: { data?: unknown; error?: unknown };
  } = {},
) {
  const rpc = vi.fn(() =>
    Promise.resolve({ data: { id: "order-uuid-1", order_number: "ML-1", total: 10000 }, error: null }),
  );
  const getUser = vi.fn(
    opts.getUserImpl ??
      (() => Promise.resolve({ data: { user: opts.usuario ?? null }, error: null })),
  );
  const itemsQuery = crearQueryBuilder(
    opts.itemsResultado ?? {
      data: [{ name_snapshot: "Pijama Rosa Talla M", qty: 2, line_total: 10000 }],
      error: null,
    },
  );
  const from = vi.fn(() => itemsQuery);
  return { rpc, auth: { getUser }, from, itemsQuery };
}

describe("confirmarPedido", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
    vi.mocked(redirect).mockClear();
    vi.mocked(enviarCorreo).mockReset();
    vi.mocked(enviarCorreo).mockResolvedValue({ id: "email-test-id" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rechaza paymentMethod='wompi' sin llamar create_order (evita el doble descuento de stock)", async () => {
    // create_order descuenta stock de inmediato. Los pedidos Wompi NUNCA
    // deben descontar stock al crearse: eso lo hace
    // confirm_order_payment_wompi cuando llega el webhook APPROVED. Si
    // confirmarPedido aceptara "wompi" (es alcanzable directamente como
    // Server Action / POST, no solo desde el formulario), quedaria un pedido
    // con payment_method='wompi' y status='pendiente' — exactamente la forma
    // que busca el webhook — con el stock YA descontado; un evento APPROVED
    // posterior lo descontaria por segunda vez.
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { confirmarPedido } = await import("../actions");
    const resultado = await confirmarPedido({ ...DATOS_CHECKOUT, paymentMethod: "wompi" });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("rechaza datos invalidos sin llamar create_order", async () => {
    const supabase = crearSupabaseMock();
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { confirmarPedido } = await import("../actions");
    const resultado = await confirmarPedido({ ...DATOS_CHECKOUT, fullName: "" });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it.each(["efectivo", "transferencia"] as const)(
    "sigue aceptando el metodo de pago manual '%s'",
    async (metodo) => {
      const supabase = crearSupabaseMock();
      vi.mocked(createClient).mockResolvedValue(supabase as never);

      const { confirmarPedido } = await import("../actions");
      // redirect() esta mockeado para lanzar, igual que en produccion
      // (Next.js lo implementa lanzando una excepcion de control de flujo).
      await expect(
        confirmarPedido({ ...DATOS_CHECKOUT, paymentMethod: metodo }),
      ).rejects.toThrow("NEXT_REDIRECT");

      expect(supabase.rpc).toHaveBeenCalledWith(
        "create_order",
        expect.objectContaining({ p_payment_method: metodo }),
      );
    },
  );

  it("con usuario autenticado: envia el correo del pedido a su email, con el numero de pedido en el asunto", async () => {
    const supabase = crearSupabaseMock({ usuario: { email: "cliente@example.com" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { confirmarPedido } = await import("../actions");
    await expect(confirmarPedido(DATOS_CHECKOUT)).rejects.toThrow("NEXT_REDIRECT");

    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    expect(enviarCorreo).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "cliente@example.com",
        subject: expect.stringContaining("ML-1"),
      }),
    );
  });

  it("sin usuario autenticado: no intenta enviar ningun correo", async () => {
    const supabase = crearSupabaseMock({ usuario: null });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { confirmarPedido } = await import("../actions");
    await expect(confirmarPedido(DATOS_CHECKOUT)).rejects.toThrow("NEXT_REDIRECT");

    expect(enviarCorreo).not.toHaveBeenCalled();
  });

  it("envia el correo ANTES de redirigir (redirect() lanza: si el orden se invirtiera, el correo no saldria nunca)", async () => {
    // Este es el unico test que protege ese orden. `redirect()` de Next.js se
    // implementa lanzando una excepcion de control de flujo, asi que si una
    // futura edicion moviera el envio del correo despues del `redirect`, el
    // correo dejaria de salir en silencio para el camino de mayor trafico de
    // la tienda. Se comprueba de dos formas: el correo se envio pese a que la
    // ejecucion termino lanzando NEXT_REDIRECT, y el orden real de invocacion
    // de ambos mocks.
    const supabase = crearSupabaseMock({ usuario: { email: "cliente@example.com" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { confirmarPedido } = await import("../actions");
    await expect(confirmarPedido(DATOS_CHECKOUT)).rejects.toThrow("NEXT_REDIRECT");

    expect(enviarCorreo).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledTimes(1);
    expect(vi.mocked(enviarCorreo).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(redirect).mock.invocationCallOrder[0],
    );
  });

  it("el correo del pago manual NO afirma que el pedido quedo confirmado (todavia no se pago nada)", async () => {
    // `create_order` inserta el pedido con status 'pendiente'. Decirle al
    // cliente "tu pedido fue confirmado" antes de recibir un solo peso seria
    // falso: la variante "recibido" cambia el encabezado/intro y agrega las
    // instrucciones de pago del metodo elegido.
    const supabase = crearSupabaseMock({ usuario: { email: "cliente@example.com" } });
    vi.mocked(createClient).mockResolvedValue(supabase as never);

    const { confirmarPedido } = await import("../actions");
    await expect(
      confirmarPedido({ ...DATOS_CHECKOUT, paymentMethod: "efectivo" }),
    ).rejects.toThrow("NEXT_REDIRECT");

    const [argumentos] = vi.mocked(enviarCorreo).mock.calls[0];
    expect(argumentos.subject).not.toMatch(/confirmaci/i);
    expect(argumentos.react.type).toBe(ConfirmacionPedidoEmail);
    expect(argumentos.react.props).toEqual(
      expect.objectContaining({ variante: "recibido", metodoPago: "efectivo" }),
    );
  });

  it("un fallo inesperado al preparar el correo no interrumpe el flujo: el pedido igual redirige", async () => {
    // Llegado el bloque del correo, `create_order` ya descontó stock, creó el
    // pedido y vació el carrito. Si un fallo inesperado de supabase-js (que
    // puede lanzar, no solo devolver `{error}`) escapara, no se ejecutaria el
    // `redirect` y el cliente veria un error por un pedido que SI se creo;
    // al reintentar se toparia con "Tu carrito esta vacio.".
    const supabase = crearSupabaseMock({
      getUserImpl: () => Promise.reject(new Error("fallo inesperado de red")),
    });
    vi.mocked(createClient).mockResolvedValue(supabase as never);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { confirmarPedido } = await import("../actions");
    // Lo que se exige es que siga lanzando NEXT_REDIRECT (el flujo llego a su
    // final feliz), no el error de red.
    await expect(confirmarPedido(DATOS_CHECKOUT)).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/cuenta/pedidos/order-uuid-1?confirmado=1");
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[email]"),
      expect.any(Error),
    );
  });
});
