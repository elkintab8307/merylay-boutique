import { beforeEach, describe, expect, it, vi } from "vitest";

const procesarMock = vi.hoisted(() => vi.fn());
vi.mock("./handler.ts", () => ({ procesarMensajeEntrante: procesarMock }));
vi.mock("./meta-signature.ts", () => ({ verificarFirmaMeta: (payload: string, firma: string | null) => firma === "sha256=valida" }));

beforeEach(() => {
  vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "META_APP_SECRET" ? "secreto" : k === "META_VERIFY_TOKEN" ? "token-verificacion" : undefined)) } });
  vi.stubGlobal("EdgeRuntime", { waitUntil: vi.fn() });
  procesarMock.mockClear();
});

describe("handleRequest", () => {
  it("responde el challenge de verificacion de Meta en el handshake GET", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/whatsapp-webhook?hub.mode=subscribe&hub.verify_token=token-verificacion&hub.challenge=123456", { method: "GET" });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(200);
    expect(await respuesta.text()).toBe("123456");
  });

  it("rechaza con 403 si la firma del POST no es valida", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/whatsapp-webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=invalida" },
      body: "{}",
    });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(403);
    expect(procesarMock).not.toHaveBeenCalled();
  });

  it("responde 200 de inmediato y procesa en segundo plano si la firma es valida", async () => {
    const { handleRequest } = await import("./index.ts");
    const req = new Request("https://x/whatsapp-webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=valida" },
      body: '{"hola":"mundo"}',
    });

    const respuesta = await handleRequest(req);

    expect(respuesta.status).toBe(200);
    expect((globalThis as unknown as { EdgeRuntime: { waitUntil: ReturnType<typeof vi.fn> } }).EdgeRuntime.waitUntil).toHaveBeenCalled();
  });
});
