// @vitest-environment node
//
// Entorno "node": esta Server Action solo ejercita logica de servidor
// (validacion + cliente de Supabase), no necesita el DOM de jsdom.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import type { CheckoutInput } from "@/lib/validation/checkout";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
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

function crearSupabaseMock() {
  const rpc = vi.fn(() => Promise.resolve({ data: { id: "order-uuid-1" }, error: null }));
  return { rpc };
}

describe("confirmarPedido", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
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
});
