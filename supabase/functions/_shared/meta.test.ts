import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";

describe("enviarTexto", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
      } as Record<string, string>)[key]) },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("llama a la Graph API con el token, el numero y el cuerpo del mensaje", async () => {
    const { enviarTexto } = await import("./meta.ts");
    await enviarTexto("573001234567", "Hola, soy el bot de MeryLay");

    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/123456/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token-de-prueba" }),
      }),
    );
    const [, opciones] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo).toMatchObject({
      to: "573001234567",
      type: "text",
      text: { body: "Hola, soy el bot de MeryLay" },
    });
  });

  it("lanza un error si la Graph API responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"error\":\"token invalido\"}", { status: 401 })));
    const { enviarTexto } = await import("./meta.ts");
    await expect(enviarTexto("573001234567", "hola")).rejects.toThrow(/401/);
  });
});
