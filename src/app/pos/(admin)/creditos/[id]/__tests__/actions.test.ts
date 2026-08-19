// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("registrarAbono", () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rechaza un monto invalido sin llamar al RPC", async () => {
    const rpc = vi.fn();
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const { registrarAbono } = await import("../actions");
    const resultado = await registrarAbono("sale-1", { amount: 0, paymentMethod: "efectivo" });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("abono valido: llama al RPC con los parametros correctos", async () => {
    const rpc = vi.fn(() => Promise.resolve({ data: { id: "pago-1" }, error: null }));
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const { registrarAbono } = await import("../actions");
    const resultado = await registrarAbono("sale-1", { amount: 50000, paymentMethod: "efectivo" });

    expect(resultado).toEqual({});
    expect(rpc).toHaveBeenCalledWith("registrar_abono_credito", {
      p_sale_id: "sale-1",
      p_amount: 50000,
      p_payment_method: "efectivo",
    });
  });

  it("cuando el RPC rechaza (ej. sobrepago), retorna el mensaje de error", async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({
        data: null,
        error: { message: "El abono no puede superar el saldo pendiente." },
      }),
    );
    vi.mocked(createClient).mockResolvedValue({ rpc } as never);

    const { registrarAbono } = await import("../actions");
    const resultado = await registrarAbono("sale-1", { amount: 999999, paymentMethod: "efectivo" });

    expect(resultado).toEqual({ error: "El abono no puede superar el saldo pendiente." });
  });
});
