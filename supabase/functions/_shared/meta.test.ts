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

describe("obtenerUrlMedia", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
      } as Record<string, string>)[key]) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("pide la url real del medio a la Graph API con el token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      JSON.stringify({ url: "https://graph.facebook.com/medio-real.ogg" }),
      { status: 200 },
    )));
    const { obtenerUrlMedia } = await import("./meta.ts");

    const url = await obtenerUrlMedia("media-123");

    expect(url).toBe("https://graph.facebook.com/medio-real.ogg");
    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/media-123",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token-de-prueba" }) }),
    );
  });

  it("lanza un error si la Graph API responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no autorizado", { status: 401 })));
    const { obtenerUrlMedia } = await import("./meta.ts");
    await expect(obtenerUrlMedia("media-123")).rejects.toThrow(/401/);
  });
});

describe("descargarMedia", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
      } as Record<string, string>)[key]) },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("descarga los bytes del medio con el token de autorizacion", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200 })));
    const { descargarMedia } = await import("./meta.ts");

    const resultado = await descargarMedia("https://graph.facebook.com/medio-real.ogg");

    expect(new Uint8Array(resultado)).toEqual(bytes);
    expect(fetch).toHaveBeenCalledWith(
      "https://graph.facebook.com/medio-real.ogg",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer token-de-prueba" }) }),
    );
  });

  it("lanza un error si la descarga falla", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("no encontrado", { status: 404 })));
    const { descargarMedia } = await import("./meta.ts");
    await expect(descargarMedia("https://graph.facebook.com/no-existe.ogg")).rejects.toThrow(/404/);
  });
});

describe("marcarLeidoYEscribiendo", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
      } as Record<string, string>)[key]) },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("marca el mensaje como leido y activa el indicador de escribiendo", async () => {
    const { marcarLeidoYEscribiendo } = await import("./meta.ts");

    await marcarLeidoYEscribiendo("wamid.abc123");

    const [, opciones] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo).toMatchObject({
      status: "read",
      message_id: "wamid.abc123",
      typing_indicator: { type: "text" },
    });
  });

  it("lanza un error si la Graph API responde con error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"error\":\"token invalido\"}", { status: 401 })));
    const { marcarLeidoYEscribiendo } = await import("./meta.ts");
    await expect(marcarLeidoYEscribiendo("wamid.abc123")).rejects.toThrow(/401/);
  });
});

describe("enviarBotonProducto", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
      } as Record<string, string>)[key]) },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("manda un mensaje interactivo con imagen, cuerpo y un boton de respuesta", async () => {
    const { enviarBotonProducto } = await import("./meta.ts");

    await enviarBotonProducto("573001234567", {
      fotoUrl: "https://x/foto.jpg",
      cuerpo: "Pijama Rosa\nTalla M\n$89.900\nStock: 5",
      botonId: "add:11111111-1111-4111-8111-111111111111:-",
      botonTitulo: "Agregar al carrito",
    });

    const [, opciones] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo).toMatchObject({
      to: "573001234567",
      type: "interactive",
      interactive: {
        type: "button",
        header: { type: "image", image: { link: "https://x/foto.jpg" } },
        body: { text: "Pijama Rosa\nTalla M\n$89.900\nStock: 5" },
        action: { buttons: [{ type: "reply", reply: { id: "add:11111111-1111-4111-8111-111111111111:-", title: "Agregar al carrito" } }] },
      },
    });
  });
});
