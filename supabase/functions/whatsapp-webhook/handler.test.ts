import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parsearMensajeEntrante: vi.fn(),
  buscarOCrearCliente: vi.fn(),
  obtenerOCrearSesion: vi.fn(),
  guardarSesion: vi.fn(),
  decidirAccion: vi.fn(),
  enviarTexto: vi.fn(),
  consultarStockBajo: vi.fn(),
  actualizarPrecioProducto: vi.fn(),
}));

vi.mock("./adapters.ts", () => ({ parsearMensajeEntrante: mocks.parsearMensajeEntrante }));
vi.mock("./customers.ts", () => ({ buscarOCrearCliente: mocks.buscarOCrearCliente, normalizarTelefono: (t: string) => t.replace(/\D/g, "") }));
vi.mock("./sessions.ts", () => ({ obtenerOCrearSesion: mocks.obtenerOCrearSesion, guardarSesion: mocks.guardarSesion }));
vi.mock("./agent.ts", () => ({ decidirAccion: mocks.decidirAccion }));
vi.mock("../_shared/meta.ts", () => ({ enviarTexto: mocks.enviarTexto, enviarImagenPorLink: vi.fn(), enviarDocumentoPorLink: vi.fn() }));
vi.mock("./owner-actions.ts", () => ({
  consultarStockBajo: mocks.consultarStockBajo,
  actualizarPrecioProducto: mocks.actualizarPrecioProducto,
  ACCIONES_ESCRITURA: new Set(["actualizar_precio_producto"]),
}));
vi.mock("./catalog.ts", () => ({ buscarProductos: vi.fn(), generarCatalogoPdf: vi.fn(), generarCotizacionPdf: vi.fn() }));
vi.mock("./orders.ts", () => ({ crearPedidoWompiDesdeCarrito: vi.fn() }));

const dbMocks = vi.hoisted(() => ({ insertarMensaje: vi.fn() }));
vi.mock("../_shared/db.ts", () => ({
  getSupabase: () => ({
    from: () => ({ insert: dbMocks.insertarMensaje }),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "WHATSAPP_OWNER_NUMBERS" ? "573215879805,573102862373" : undefined)) } });
  dbMocks.insertarMensaje.mockResolvedValue({ error: null });
  mocks.buscarOCrearCliente.mockResolvedValue({ profileId: "perfil-1", esNuevo: false });
  mocks.obtenerOCrearSesion.mockResolvedValue({ id: "sesion-1", sessionData: { cart: [], pendingConfirmation: null } });
});

describe("procesarMensajeEntrante", () => {
  it("no procesa dos veces el mismo message_id (idempotencia)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.1", from: "573001234567", texto: "hola" });
    dbMocks.insertarMensaje.mockResolvedValue({ error: { code: "23505" } }); // violacion de unique

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).not.toHaveBeenCalled();
  });

  it("reconoce a +573215879805 como Elkin aunque llegue con '+' y espacios", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.2", from: "+57 321 587 9805", texto: "ventas de hoy" });
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola Elkin" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).toHaveBeenCalledWith(expect.objectContaining({ rol: "owner", nombreDueno: "Elkin" }));
  });

  it("no ejecuta una accion de escritura si la confirmacion es ambigua", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.3", from: "573215879805", texto: "tal vez, dejame pensarlo" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).not.toHaveBeenCalled();
  });

  it("no ejecuta una accion de escritura si la respuesta es condicional ('si no es necesario, cancela')", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.3b", from: "573215879805", texto: "si no es necesario, cancela" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).not.toHaveBeenCalled();
  });

  it("no ejecuta una accion de escritura si la respuesta matiza la confirmacion ('sí pero antes dime cuánto stock queda')", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.3c", from: "573215879805", texto: "sí pero antes dime cuánto stock queda" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).not.toHaveBeenCalled();
  });

  it("ejecuta la accion pendiente si el dueño confirma con 'si'", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.4", from: "573215879805", texto: "si, confirmo" });
    mocks.actualizarPrecioProducto.mockResolvedValue("Precio actualizado a $50.000.");

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).toHaveBeenCalledWith("P1", 50000);
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573215879805", "Precio actualizado a $50.000.");
  });

  it("pide confirmacion en vez de ejecutar cuando el modelo propone una accion de escritura por primera vez", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ messageId: "wamid.5", from: "573215879805", texto: "sube el precio de P1 a 50000" });
    mocks.decidirAccion.mockResolvedValue({
      action: "actualizar_precio_producto",
      params: { idOSku: "P1", nuevoPrecio: 50000 },
      response_message: "Voy a actualizar el precio.",
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573215879805", expect.stringContaining("Confirmas"));
    expect(mocks.guardarSesion).toHaveBeenCalledWith("sesion-1", expect.objectContaining({
      pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } },
    }));
  });
});
