import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enviarConfirmacionPagoWhatsapp } from "../confirmar-pago";

describe("enviarConfirmacionPagoWhatsapp", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co");
    vi.stubEnv("CONFIRMAR_PAGO_WHATSAPP_SECRET", "secreto-test");
    vi.stubGlobal("fetch", vi.fn());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("llama a la Edge Function con el orderId y el header del secreto", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 200 }));

    const resultado = await enviarConfirmacionPagoWhatsapp({ orderId: "order-1" });

    expect(fetch).toHaveBeenCalledWith(
      "https://proyecto.supabase.co/functions/v1/confirmar-pago-whatsapp",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-confirmar-pago-whatsapp-secret": "secreto-test" }),
        body: JSON.stringify({ orderId: "order-1" }),
      }),
    );
    expect(resultado).toEqual({ ok: true });
  });

  it("no lanza y registra el error si faltan NEXT_PUBLIC_SUPABASE_URL o CONFIRMAR_PAGO_WHATSAPP_SECRET (fail-open, igual que enviarCorreo)", async () => {
    vi.stubEnv("CONFIRMAR_PAGO_WHATSAPP_SECRET", "");

    const resultado = await enviarConfirmacionPagoWhatsapp({ orderId: "order-1" });

    expect(fetch).not.toHaveBeenCalled();
    expect(resultado).toEqual({ error: expect.any(String) });
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[whatsapp]"));
  });

  it("no lanza y registra el error si la Edge Function responde con un status de error", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("boom", { status: 500 }));

    const resultado = await enviarConfirmacionPagoWhatsapp({ orderId: "order-1" });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[whatsapp]"),
      expect.anything(),
    );
  });

  it("no lanza y registra el error si fetch rechaza inesperadamente", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("fallo de red"));

    const resultado = await enviarConfirmacionPagoWhatsapp({ orderId: "order-1" });

    expect(resultado).toEqual({ error: expect.any(String) });
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("[whatsapp]"),
      expect.any(Error),
    );
  });
});
