import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  hashTikTok,
  normalizarTelefonoE164,
  construirEventoCompra,
  reportarCompraTikTok,
  type CompraTikTokInput,
} from "../tiktok-server";

const compra: CompraTikTokInput = {
  pedidoId: "11111111-2222-3333-4444-555555555555",
  total: 90000,
  items: [{ productId: "prod-1", nombre: "Camiseta Mariposa", precio: 45000, qty: 2 }],
  email: "  Clienta@Ejemplo.COM ",
  telefono: "3001234567",
  userId: "user-abc",
  ttclid: "ttclid-xyz",
  ttp: "ttp-123",
  ip: "190.1.2.3",
  userAgent: "Mozilla/5.0",
  urlPagina: "https://merylay.shop/checkout/wompi/retorno",
  eventTime: 1732329600,
  testEventCode: null,
};

describe("hashTikTok", () => {
  it("devuelve SHA-256 hex en minusculas del valor normalizado", () => {
    // sha256("hola") en hex
    expect(hashTikTok("hola")).toBe(
      "b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79",
    );
  });

  it("normaliza espacios y mayusculas antes de hashear", () => {
    expect(hashTikTok("  HOLA ")).toBe(hashTikTok("hola"));
  });
});

describe("normalizarTelefonoE164", () => {
  it("convierte un celular colombiano de 10 digitos a +57", () => {
    expect(normalizarTelefonoE164("300 123 4567")).toBe("+573001234567");
  });

  it("acepta ya el prefijo 57 sin el signo mas", () => {
    expect(normalizarTelefonoE164("573001234567")).toBe("+573001234567");
  });

  it("devuelve null si no es un numero reconocible", () => {
    expect(normalizarTelefonoE164("123")).toBeNull();
  });
});

describe("construirEventoCompra", () => {
  it("usa el id del pedido como event_id y Purchase como evento", () => {
    const evento = construirEventoCompra(compra, "PIXEL");
    expect(evento.event_source).toBe("web");
    expect(evento.event_source_id).toBe("PIXEL");
    const data = (evento.data as Record<string, unknown>[])[0];
    expect(data.event).toBe("Purchase");
    expect(data.event_id).toBe(compra.pedidoId);
  });

  it("nunca envia el email ni el telefono en texto plano", () => {
    const texto = JSON.stringify(construirEventoCompra(compra, "PIXEL"));
    expect(texto).not.toContain("clienta@ejemplo.com");
    expect(texto).not.toContain("3001234567");
    expect(texto).toContain(hashTikTok("clienta@ejemplo.com"));
    expect(texto).toContain(hashTikTok("+573001234567"));
  });

  it("envia ttclid, ttp, ip y user agent sin hashear, y external_id hasheado", () => {
    const data = (construirEventoCompra(compra, "PIXEL").data as Record<string, unknown>[])[0];
    const user = data.user as Record<string, string>;
    expect(user.ttclid).toBe("ttclid-xyz");
    expect(user.ttp).toBe("ttp-123");
    expect(user.ip).toBe("190.1.2.3");
    expect(user.user_agent).toBe("Mozilla/5.0");
    expect(user.external_id).toBe(hashTikTok("user-abc"));
  });

  it("omite los campos de usuario que no tiene", () => {
    const sinDatos = { ...compra, email: null, telefono: null, ttclid: null, ttp: null, ip: null, userAgent: null, userId: null };
    const data = (construirEventoCompra(sinDatos, "PIXEL").data as Record<string, unknown>[])[0];
    expect(data.user).toEqual({});
  });

  it("incluye value, currency y contents con los productos del pedido", () => {
    const data = (construirEventoCompra(compra, "PIXEL").data as Record<string, unknown>[])[0];
    const props = data.properties as Record<string, unknown>;
    expect(props.value).toBe(90000);
    expect(props.currency).toBe("COP");
    expect(props.contents).toEqual([
      { content_id: "prod-1", content_type: "product", content_name: "Camiseta Mariposa", price: 45000, quantity: 2 },
    ]);
  });

  it("agrega test_event_code solo cuando se configura", () => {
    expect(construirEventoCompra(compra, "PIXEL").test_event_code).toBeUndefined();
    expect(construirEventoCompra({ ...compra, testEventCode: "TEST123" }, "PIXEL").test_event_code).toBe("TEST123");
  });
});

describe("reportarCompraTikTok", () => {
  const envOriginal = { ...process.env };

  beforeEach(() => {
    process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID = "PIXEL";
    process.env.TIKTOK_EVENTS_API_TOKEN = "token-secreto";
    delete process.env.TIKTOK_TEST_EVENT_CODE;
  });

  afterEach(() => {
    process.env = { ...envOriginal };
    vi.restoreAllMocks();
  });

  it("no llama a TikTok si falta el token (desactivado sin romper)", async () => {
    delete process.env.TIKTOK_EVENTS_API_TOKEN;
    const fetchMock = vi.fn();
    const resultado = await reportarCompraTikTok(compra, { fetch: fetchMock as unknown as typeof fetch });
    expect(resultado).toEqual({ enviado: false, motivo: "desactivado" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("no llama a TikTok si falta el pixel", async () => {
    delete process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
    const fetchMock = vi.fn();
    const resultado = await reportarCompraTikTok(compra, { fetch: fetchMock as unknown as typeof fetch });
    expect(resultado.enviado).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envia el evento al endpoint de Events API con el header Access-Token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0 }), { status: 200 }));
    const resultado = await reportarCompraTikTok(compra, { fetch: fetchMock as unknown as typeof fetch });

    expect(resultado).toEqual({ enviado: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://business-api.tiktok.com/open_api/v1.3/event/track/");
    expect((init.headers as Record<string, string>)["Access-Token"]).toBe("token-secreto");
    expect(JSON.parse(init.body as string).data[0].event).toBe("Purchase");
  });

  it("devuelve enviado false si TikTok responde con error, sin lanzar", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad", { status: 500 }));
    const resultado = await reportarCompraTikTok(compra, { fetch: fetchMock as unknown as typeof fetch });
    expect(resultado.enviado).toBe(false);
  });

  it("devuelve enviado false si la red falla, sin lanzar", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("red caida"));
    const resultado = await reportarCompraTikTok(compra, { fetch: fetchMock as unknown as typeof fetch });
    expect(resultado.enviado).toBe(false);
  });
});
