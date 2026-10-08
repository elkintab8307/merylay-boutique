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

  it("no espera el backoff despues del ultimo intento fallido", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("error de servidor", { status: 500 })));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    // 3 intentos => solo 2 esperas (entre el 1o y 2o, y entre el 2o y 3o).
    const esperasDeBackoff = setTimeoutSpy.mock.calls.filter(([, ms]) => typeof ms === "number" && ms >= 500);
    expect(esperasDeBackoff.map(([, ms]) => ms)).toEqual([500, 1000]);
    setTimeoutSpy.mockRestore();
  });

  it("documenta en el prompt de cliente los parametros exactos de cada accion", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    for (const clave of ["consulta", "productId", "variantId", "qty", "fullName", "phone", "address", "city", "talla", "color"]) {
      expect(prompt).toContain(clave);
    }
    expect(prompt).not.toContain("unitPrice");
    expect(prompt).toMatch(/buscar_producto/);
    expect(prompt).toContain("buscar_producto");
    expect(prompt).toContain("generar_catalogo_pdf");
  });

  it("la instruccion de agregar_al_carrito ya no promete ids de buscar_producto en el texto de la conversacion", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;

    // buscar_producto ya no deja ids en texto (manda tarjetas con boton), asi
    // que la vieja instruccion de "copialos TAL CUAL de un resultado previo
    // de buscar_producto" ya no aplica -- debe haber sido retirada.
    expect(prompt).not.toMatch(/TAL CUAL de un resultado previo de buscar_producto/);
    // La nueva instruccion debe decirle al modelo que pida al cliente tocar
    // el boton (o describir el producto de nuevo) cuando no haya un id real.
    expect(prompt).toContain("boton");
    expect(prompt).toContain("Agregar al carrito");
    // La prohibicion de inventar/deducir los ids del nombre se mantiene.
    expect(prompt).toMatch(/NUNCA los inventes ni los deduzcas del nombre/);
  });

  it("documenta en el prompt del dueño los parametros exactos de cada accion", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "owner", nombreDueno: "Mary", historial: [], mensajeEntrante: "hola" });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    for (const clave of ["dias", "umbral", "consulta", "numeroOId", "idOSku", "nuevoPrecio", "nuevoStock", "numeroPedido", "nuevoEstado", "activo", "conPdf", "limite", "nombreOTelefono", "agregadoDesdeDias", "formato"]) {
      expect(prompt).toContain(clave);
    }
    expect(prompt).toContain("consultar_productos");
    expect(prompt).toContain("informe_creditos");
    expect(prompt).toContain("informe_abonos");
    expect(prompt).not.toContain("buscar_inventario:");
    expect(prompt).not.toContain("generar_informe_pdf:");
    expect(prompt).toContain("conFotos");
    expect(prompt).not.toContain("consultar_producto:");
    expect(prompt).toContain("informe_ventas");
    expect(prompt).toContain("productos_mas_vendidos");
    expect(prompt).toContain("informe_clientes");
    expect(prompt).toContain("historial_cliente");
    expect(prompt).toContain("informe_gastos");
    expect(prompt).not.toContain("consultar_ventas:");
  });

  it("el prompt del dueño instruye responder de forma cordial y ejecutar lo que se le pide", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "owner", nombreDueno: "Elkin", historial: [], mensajeEntrante: "hola" });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    expect(prompt).toMatch(/cordial/i);
  });

  it("envia el historial a OpenAI en orden, como mensajes user/assistant", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({
      rol: "customer",
      historial: [
        { direction: "inbound", message_body: "busco batas" },
        { direction: "outbound", message_body: "1. Bata [productId:p1]" },
      ],
      mensajeEntrante: "agrega la 1",
    });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(cuerpo.messages.slice(1)).toEqual([
      { role: "user", content: "busco batas" },
      { role: "assistant", content: "1. Bata [productId:p1]" },
      { role: "user", content: "agrega la 1" },
    ]);
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

  it("el prompt de cliente instruye saludar con cordialidad y preguntar que necesita", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ action: "chat", params: {}, response_message: "Hola" }) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { decidirAccion } = await import("./agent.ts");
    await decidirAccion({ rol: "customer", historial: [], mensajeEntrante: "hola" });

    const cuerpo = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const prompt = cuerpo.messages[0].content as string;
    expect(prompt).toMatch(/saluda|cordial/i);
  });
});
