import { beforeEach, describe, expect, it, vi } from "vitest";

const construirItemsCatalogoMock = vi.hoisted(() => vi.fn());
const enviarItemsBatchMock = vi.hoisted(() => vi.fn());
vi.mock("./catalogo-meta.ts", () => ({
  construirItemsCatalogo: construirItemsCatalogoMock,
  enviarItemsBatch: enviarItemsBatchMock,
}));

const getSupabaseMock = vi.hoisted(() => vi.fn());
vi.mock("../_shared/db.ts", () => ({ getSupabase: getSupabaseMock }));

beforeEach(() => {
  construirItemsCatalogoMock.mockReset();
  enviarItemsBatchMock.mockReset();
  getSupabaseMock.mockReset();
  getSupabaseMock.mockReturnValue({});
  vi.stubGlobal("Deno", {
    env: { get: vi.fn((k: string) => ({ SYNC_CATALOGO_SECRET: "secreto-sync" } as Record<string, string>)[k]) },
  });
});

function peticion(secret?: string): Request {
  return new Request("https://x/sincronizar-catalogo", {
    method: "POST",
    headers: secret ? { "x-sync-catalogo-secret": secret } : {},
  });
}

describe("handleRequest", () => {
  it("rechaza con 401 si el header secreto no coincide", async () => {
    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion("incorrecto"));
    expect(respuesta.status).toBe(401);
    expect(construirItemsCatalogoMock).not.toHaveBeenCalled();
  });

  it("con el secreto correcto: construye los items y los manda, devolviendo el resumen", async () => {
    construirItemsCatalogoMock.mockResolvedValue([{ method: "UPDATE", data: { id: "SKU-1" } }]);
    enviarItemsBatchMock.mockResolvedValue({ enviados: 1, errores: [] });

    const { handleRequest } = await import("./index.ts");
    const respuesta = await handleRequest(peticion("secreto-sync"));

    expect(respuesta.status).toBe(200);
    const cuerpo = await respuesta.json();
    expect(cuerpo).toEqual({ total: 1, enviados: 1, errores: [] });
    expect(enviarItemsBatchMock).toHaveBeenCalledWith([{ method: "UPDATE", data: { id: "SKU-1" } }]);
  });
});
