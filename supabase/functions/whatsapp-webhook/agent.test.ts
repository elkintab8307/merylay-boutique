import { beforeEach, describe, expect, it, vi } from "vitest";

describe("decidirAccion", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "OPENAI_API_KEY" ? "sk-test" : undefined)) } });
  });

  it("devuelve la accion que decide el modelo cuando la respuesta es JSON valido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "Buscando..." }) } }],
    }), { status: 200 })));

    const { decidirAccion } = await import("./agent.ts");
    const resultado = await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "tienen pijamas?" });

    expect(resultado).toEqual({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "Buscando..." });
  });

  it("reintenta una vez si OpenAI responde 429 y despues funciona", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("limite excedido", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola!" }) } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    const resultado = await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resultado.action).toBe("chat");
  });

  it("devuelve action: error si fallan todos los reintentos", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error de servidor", { status: 500 })));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { decidirAccion } = await import("./agent.ts");
    const resultado = await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    expect(resultado.action).toBe("error");
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("incluye el nombre del dueño en el prompt cuando el rol es owner", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola Elkin" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "owner", nombreDueno: "Elkin", historial: [], mensajeEntrante: "hola" });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const promptSistema = cuerpo.messages[0].content as string;
    expect(promptSistema).toContain("Elkin");
  });

  it("no reintenta y falla rapido si OpenAI responde un error no transitorio (401)", async () => {
    const fetchMock = vi.fn(async () => new Response("no autorizado", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { decidirAccion } = await import("./agent.ts");
    const resultado = await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado.action).toBe("error");
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
