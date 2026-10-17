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

describe("enviarCarruselProductos", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
        META_CATALOG_ID: "1832369491097812",
      } as Record<string, string>)[key]) },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  // interactive.type "carousel": a diferencia de product_list, estas
  // tarjetas se muestran deslizables DIRECTO en el chat (sin el paso extra
  // de tocar "Ver articulos") -- Meta exige NO mandar header/footer/botones,
  // y cada tarjeta lleva su propio card_index (0-9) y catalog_id repetido.
  it("manda un carrusel (interactive carousel) con una tarjeta de producto por retailer_id", async () => {
    const { enviarCarruselProductos } = await import("./meta.ts");

    await enviarCarruselProductos("573001234567", {
      cuerpo: "Elige el que más te guste:",
      retailerIds: ["SKU-1", "SKU-2", "SKU-3"],
    });

    const [, opciones] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo).toMatchObject({
      to: "573001234567",
      type: "interactive",
      interactive: {
        type: "carousel",
        body: { text: "Elige el que más te guste:" },
        action: {
          cards: [
            { card_index: 0, type: "product", action: { catalog_id: "1832369491097812", product_retailer_id: "SKU-1" } },
            { card_index: 1, type: "product", action: { catalog_id: "1832369491097812", product_retailer_id: "SKU-2" } },
            { card_index: 2, type: "product", action: { catalog_id: "1832369491097812", product_retailer_id: "SKU-3" } },
          ],
        },
      },
    });
  });

  it("nunca incluye header, footer ni botones (Meta los rechaza en interactive carousel)", async () => {
    const { enviarCarruselProductos } = await import("./meta.ts");

    await enviarCarruselProductos("573001234567", { cuerpo: "Mira:", retailerIds: ["SKU-1", "SKU-2"] });

    const [, opciones] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo.interactive.header).toBeUndefined();
    expect(cuerpo.interactive.footer).toBeUndefined();
    expect(cuerpo.interactive.action.buttons).toBeUndefined();
  });

  it("lanza un error claro si falta META_CATALOG_ID", async () => {
    vi.stubGlobal("Deno", { env: { get: vi.fn((key: string) => (key === "META_ACCESS_TOKEN" ? "token-de-prueba" : key === "META_PHONE_NUMBER_ID" ? "123456" : undefined)) } });
    const { enviarCarruselProductos } = await import("./meta.ts");
    await expect(enviarCarruselProductos("573001234567", { cuerpo: "x", retailerIds: ["SKU-1", "SKU-2"] })).rejects.toThrow(/META_CATALOG_ID/);
  });

  // Bug real (2026-10-17): Meta a veces no ha terminado de procesar un SKU
  // puntual (ej. todavia no le recupero la foto) aunque el resto del
  // catalogo si este listo. El carrusel es todo-o-nada: una sola tarjeta
  // invalida tumbaba las otras 9 validas y la clienta no veia nada.
  it("si Meta rechaza un SKU puntual (131009 product not found), reintenta sin ese SKU", async () => {
    const error131009 = JSON.stringify({
      error: {
        message: "(#131009) Parameter value is not valid",
        code: 131009,
        error_data: {
          messaging_product: "whatsapp",
          details: "product not found for product_retailer_id, CAM-000009-S-CAFE, in catalog_id, 1832369491097812",
        },
      },
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(error131009, { status: 400 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { enviarCarruselProductos } = await import("./meta.ts");

    await enviarCarruselProductos("573001234567", {
      cuerpo: "Elige el que más te guste:",
      retailerIds: ["CAM-000009-S-CAFE", "SKU-2", "SKU-3"],
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, opciones] = fetchMock.mock.calls[1] as [string, RequestInit];
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo.interactive.action.cards).toEqual([
      { card_index: 0, type: "product", action: { catalog_id: "1832369491097812", product_retailer_id: "SKU-2" } },
      { card_index: 1, type: "product", action: { catalog_id: "1832369491097812", product_retailer_id: "SKU-3" } },
    ]);
  });

  it("si tras quitar el SKU invalido quedaria menos de 2 tarjetas, no reintenta y lanza el error original", async () => {
    const error131009 = JSON.stringify({
      error: {
        message: "(#131009) Parameter value is not valid",
        code: 131009,
        error_data: {
          messaging_product: "whatsapp",
          details: "product not found for product_retailer_id, CAM-000009-S-CAFE, in catalog_id, 1832369491097812",
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(error131009, { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    const { enviarCarruselProductos } = await import("./meta.ts");

    await expect(
      enviarCarruselProductos("573001234567", { cuerpo: "x", retailerIds: ["CAM-000009-S-CAFE", "SKU-2"] }),
    ).rejects.toThrow(/131009/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("si el error de Graph API no es por un product_retailer_id invalido, no reintenta y lo relanza tal cual", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{\"error\":{\"message\":\"token invalido\"}}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    const { enviarCarruselProductos } = await import("./meta.ts");

    await expect(
      enviarCarruselProductos("573001234567", { cuerpo: "x", retailerIds: ["SKU-1", "SKU-2"] }),
    ).rejects.toThrow(/401/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("enviarProductoUnico", () => {
  beforeEach(() => {
    vi.stubGlobal("Deno", {
      env: { get: vi.fn((key: string) => ({
        META_ACCESS_TOKEN: "token-de-prueba",
        META_PHONE_NUMBER_ID: "123456",
        META_CATALOG_ID: "1832369491097812",
      } as Record<string, string>)[key]) },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("manda un mensaje interactivo de UN solo producto del catalogo (para el link de 'Preguntar por WhatsApp')", async () => {
    const { enviarProductoUnico } = await import("./meta.ts");

    await enviarProductoUnico("573001234567", { cuerpo: "¡Qué linda elección!", retailerId: "SKU-CAMISETA-MARIPOSA" });

    const [, opciones] = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0] as [string, RequestInit];
    const cuerpo = JSON.parse(opciones.body as string);
    expect(cuerpo).toMatchObject({
      to: "573001234567",
      type: "interactive",
      interactive: {
        type: "product",
        body: { text: "¡Qué linda elección!" },
        action: { catalog_id: "1832369491097812", product_retailer_id: "SKU-CAMISETA-MARIPOSA" },
      },
    });
  });
});
