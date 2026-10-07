import { beforeEach, describe, expect, it, vi } from "vitest";

const enviarTextoMock = vi.hoisted(() => vi.fn());
vi.mock("../_shared/meta.ts", () => ({ enviarTexto: enviarTextoMock }));

beforeEach(() => {
  enviarTextoMock.mockClear();
  vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => ({
    WHATSAPP_OWNER_NUMBERS: "573215879805,573102862373",
    NOTIFICAR_PEDIDO_SECRET: "secreto-del-trigger",
  } as Record<string, string>)[k]) } });
});

describe("handleRequest", () => {
  it("rechaza con 401 si el header secreto no coincide", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/notificar-pedido", {
      method: "POST",
      headers: { "x-notificar-pedido-secret": "incorrecto" },
      body: JSON.stringify({ type: "INSERT", table: "orders", record: {} }),
    });

    const respuesta = await handleRequest(req);
    expect(respuesta.status).toBe(401);
    expect(enviarTextoMock).not.toHaveBeenCalled();
  });

  it("avisa a Elkin y a Mary cuando entra un pedido nuevo", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/notificar-pedido", {
      method: "POST",
      headers: { "x-notificar-pedido-secret": "secreto-del-trigger" },
      body: JSON.stringify({
        type: "INSERT",
        table: "orders",
        record: { order_number: "ML-20261006-abc123", total: 150000, channel: "whatsapp" },
      }),
    });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).toHaveBeenCalledTimes(2);
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("ML-20261006-abc123"));
    expect(enviarTextoMock).toHaveBeenCalledWith("573102862373", expect.stringContaining("ML-20261006-abc123"));
  });

  it("avisa tambien para una venta nueva del POS, con su propio formato", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/notificar-pedido", {
      method: "POST",
      headers: { "x-notificar-pedido-secret": "secreto-del-trigger" },
      body: JSON.stringify({
        type: "INSERT",
        table: "pos_sales",
        record: { sale_number: "POS-001", total: 50000 },
      }),
    });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(200);
    expect(enviarTextoMock).toHaveBeenCalledWith("573215879805", expect.stringContaining("POS-001"));
  });
});
