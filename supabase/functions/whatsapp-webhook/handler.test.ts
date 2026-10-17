import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parsearMensajeEntrante: vi.fn(),
  buscarOCrearCliente: vi.fn(),
  obtenerOCrearSesion: vi.fn(),
  guardarSesion: vi.fn(),
  cargarHistorial: vi.fn(),
  cargarMemoria: vi.fn(),
  guardarMemoria: vi.fn(),
  decidirAccion: vi.fn(),
  enviarTexto: vi.fn(),
  enviarImagenPorLink: vi.fn(),
  enviarListaProductos: vi.fn(),
  enviarProductoUnico: vi.fn(),
  marcarLeidoYEscribiendo: vi.fn(),
  consultarStockBajo: vi.fn(),
  actualizarPrecioProducto: vi.fn(),
  consultarProductos: vi.fn(),
  transcribirAudio: vi.fn(),
  informeVentas: vi.fn(),
  productosMasVendidos: vi.fn(),
  informeClientes: vi.fn(),
  historialCliente: vi.fn(),
  informeGastos: vi.fn(),
  informeCreditos: vi.fn(),
  informeCreditosPendientes: vi.fn(),
  informeAbonos: vi.fn(),
}));

const clienteMocks = vi.hoisted(() => ({
  buscarCatalogo: vi.fn(),
  obtenerProductoParaCarrito: vi.fn(),
  obtenerProductoPorSku: vi.fn(),
  generarCatalogoPdf: vi.fn(),
  generarCotizacionPdf: vi.fn(),
  crearPedidoWompiDesdeCarrito: vi.fn(),
  generarAccesoWeb: vi.fn(),
  enviarDocumentoPorLink: vi.fn(),
}));

vi.mock("./adapters.ts", () => ({ parsearMensajeEntrante: mocks.parsearMensajeEntrante }));
vi.mock("./customers.ts", () => ({
  buscarOCrearCliente: mocks.buscarOCrearCliente,
  normalizarTelefono: (t: string) => t.replace(/\D/g, ""),
  generarAccesoWeb: clienteMocks.generarAccesoWeb,
}));
vi.mock("./sessions.ts", () => ({
  obtenerOCrearSesion: mocks.obtenerOCrearSesion,
  guardarSesion: mocks.guardarSesion,
  cargarHistorial: mocks.cargarHistorial,
}));
vi.mock("./memory.ts", () => ({
  cargarMemoria: mocks.cargarMemoria,
  guardarMemoria: mocks.guardarMemoria,
}));
vi.mock("./agent.ts", () => ({ decidirAccion: mocks.decidirAccion }));
vi.mock("../_shared/meta.ts", () => ({
  enviarTexto: mocks.enviarTexto,
  enviarImagenPorLink: mocks.enviarImagenPorLink,
  enviarListaProductos: mocks.enviarListaProductos,
  enviarProductoUnico: mocks.enviarProductoUnico,
  enviarDocumentoPorLink: clienteMocks.enviarDocumentoPorLink,
  marcarLeidoYEscribiendo: mocks.marcarLeidoYEscribiendo,
}));
vi.mock("./owner-actions.ts", () => ({
  consultarStockBajo: mocks.consultarStockBajo,
  actualizarPrecioProducto: mocks.actualizarPrecioProducto,
  consultarProductos: mocks.consultarProductos,
  ACCIONES_ESCRITURA: new Set(["actualizar_precio_producto"]),
}));
vi.mock("./catalog.ts", () => ({
  buscarCatalogo: clienteMocks.buscarCatalogo,
  obtenerProductoParaCarrito: clienteMocks.obtenerProductoParaCarrito,
  obtenerProductoPorSku: clienteMocks.obtenerProductoPorSku,
  generarCatalogoPdf: clienteMocks.generarCatalogoPdf,
  generarCotizacionPdf: clienteMocks.generarCotizacionPdf,
}));
vi.mock("./orders.ts", () => ({ crearPedidoWompiDesdeCarrito: clienteMocks.crearPedidoWompiDesdeCarrito }));
vi.mock("./voice.ts", () => ({ transcribirAudio: mocks.transcribirAudio }));
vi.mock("./reports.ts", () => ({
  informeVentas: mocks.informeVentas,
  productosMasVendidos: mocks.productosMasVendidos,
  informeClientes: mocks.informeClientes,
  historialCliente: mocks.historialCliente,
  informeGastos: mocks.informeGastos,
  informeCreditos: mocks.informeCreditos,
  informeCreditosPendientes: mocks.informeCreditosPendientes,
  informeAbonos: mocks.informeAbonos,
}));

const dbMocks = vi.hoisted(() => ({ insertarMensaje: vi.fn() }));
vi.mock("../_shared/db.ts", () => ({
  getSupabase: () => ({
    from: () => ({ insert: dbMocks.insertarMensaje }),
  }),
}));

const PRODUCTO_ID = "11111111-1111-4111-8111-111111111111";
const VARIANTE_ID = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("Deno", { env: { get: vi.fn((k: string) => (k === "WHATSAPP_OWNER_NUMBERS" ? "573215879805,573102862373" : undefined)) } });
  dbMocks.insertarMensaje.mockResolvedValue({ error: null });
  mocks.buscarOCrearCliente.mockResolvedValue({ profileId: "perfil-1", esNuevo: false });
  mocks.obtenerOCrearSesion.mockResolvedValue({ id: "sesion-1", sessionData: { cart: [], pendingConfirmation: null } });
  mocks.cargarHistorial.mockResolvedValue([]);
  mocks.cargarMemoria.mockResolvedValue([]);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("procesarMensajeEntrante", () => {
  it("no procesa dos veces el mismo message_id (idempotencia)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.1", from: "573001234567", texto: "hola" });
    dbMocks.insertarMensaje.mockResolvedValue({ error: { code: "23505" } }); // violacion de unique

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).not.toHaveBeenCalled();
  });

  it("carga la memoria de la clienta y la pasa a decidirAccion (rol customer)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem1", from: "573001234567", texto: "hola" });
    mocks.cargarMemoria.mockResolvedValue([{ categoria: "preferencia", clave: "talla_preferida", valor: "M", origen: "bot" }]);
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola de nuevo" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).toHaveBeenCalledWith(expect.objectContaining({
      memoriaCliente: [{ categoria: "preferencia", clave: "talla_preferida", valor: "M", origen: "bot" }],
    }));
  });

  it("no carga memoria para el rol owner", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem2", from: "573215879805", texto: "ventas de hoy" });
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola Elkin" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.cargarMemoria).not.toHaveBeenCalled();
  });

  it("si decidirAccion devuelve memoria nueva, la guarda", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem3", from: "573001234567", texto: "me llamo Camila" });
    mocks.decidirAccion.mockResolvedValue({
      action: "chat",
      params: {},
      response_message: "Mucho gusto, Camila",
      memoria: [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }],
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.guardarMemoria).toHaveBeenCalledWith("perfil-1", [{ categoria: "contacto", clave: "nombre_completo", valor: "Camila" }]);
  });

  it("si decidirAccion no devuelve memoria, no llama a guardarMemoria", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem4", from: "573001234567", texto: "hola" });
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.guardarMemoria).not.toHaveBeenCalled();
  });

  it("confirmar_pedido exitoso guarda direccion/ciudad en memoria, pero NO sobrescribe el nombre de la clienta (podria ser un regalo a otra persona)", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [{ productId: PRODUCTO_ID, variantId: null, imageId: null, qty: 1, unitPrice: 50000, nameSnapshot: "Pijama Rosa" }], pendingConfirmation: null },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem5", from: "573001234567", texto: "confirmo mi pedido" });
    mocks.decidirAccion.mockResolvedValue({
      action: "confirmar_pedido",
      params: { fullName: "Camila Restrepo", phone: "573001234567", address: "Calle 10 #5-20", city: "Medellín" },
      response_message: "Listo",
    });
    clienteMocks.crearPedidoWompiDesdeCarrito.mockResolvedValue({ linkPago: "https://pago.test/x", orderNumber: "ML-1" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.guardarMemoria).toHaveBeenCalledWith("perfil-1", [
      { categoria: "contacto", clave: "direccion_habitual", valor: "Calle 10 #5-20" },
      { categoria: "contacto", clave: "ciudad_habitual", valor: "Medellín" },
    ]);
  });

  it("un segundo confirmar_pedido con una ciudad distinta manda la ciudad NUEVA, no la vieja cacheada", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [{ productId: PRODUCTO_ID, variantId: null, imageId: null, qty: 1, unitPrice: 50000, nameSnapshot: "Pijama Rosa" }], pendingConfirmation: null },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.mem6", from: "573001234567", texto: "confirmo, ahora envien a Bogotá" });
    mocks.decidirAccion.mockResolvedValue({
      action: "confirmar_pedido",
      params: { fullName: "Camila Restrepo", phone: "573001234567", address: "Carrera 7 #45-10", city: "Bogotá" },
      response_message: "Listo",
    });
    clienteMocks.crearPedidoWompiDesdeCarrito.mockResolvedValue({ linkPago: "https://pago.test/y", orderNumber: "ML-2" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.guardarMemoria).toHaveBeenCalledWith("perfil-1", expect.arrayContaining([
      { categoria: "contacto", clave: "ciudad_habitual", valor: "Bogotá" },
    ]));
    expect(mocks.guardarMemoria).not.toHaveBeenCalledWith("perfil-1", expect.arrayContaining([
      expect.objectContaining({ clave: "ciudad_habitual", valor: "Medellín" }),
    ]));
  });

  it("reconoce a +573215879805 como Elkin aunque llegue con '+' y espacios", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.2", from: "+57 321 587 9805", texto: "ventas de hoy" });
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
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3", from: "573215879805", texto: "tal vez, dejame pensarlo" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).not.toHaveBeenCalled();
  });

  it("no ejecuta una accion de escritura si la respuesta es condicional ('si no es necesario, cancela')", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3b", from: "573215879805", texto: "si no es necesario, cancela" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).not.toHaveBeenCalled();
  });

  it("no ejecuta una accion de escritura si la respuesta matiza la confirmacion ('sí pero antes dime cuánto stock queda')", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3c", from: "573215879805", texto: "sí pero antes dime cuánto stock queda" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).not.toHaveBeenCalled();
  });

  it("ejecuta la accion pendiente si el dueño confirma con 'si'", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.4", from: "573215879805", texto: "si, confirmo" });
    mocks.actualizarPrecioProducto.mockResolvedValue("Precio actualizado a $50.000.");

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.actualizarPrecioProducto).toHaveBeenCalledWith("P1", 50000);
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573215879805", "Precio actualizado a $50.000.");
  });

  it("pide confirmacion en vez de ejecutar cuando el modelo propone una accion de escritura por primera vez", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.5", from: "573215879805", texto: "sube el precio de P1 a 50000" });
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

describe("manejo de errores en procesarMensajeEntrante", () => {
  it("si una accion lanza, igual responde al usuario con una disculpa generica", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: {
        cart: [{ productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 89900, nameSnapshot: "Pijama Rosa" }],
        pendingConfirmation: null,
      },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.20", from: "573009998888", texto: "confirmo" });
    mocks.decidirAccion.mockResolvedValue({
      action: "confirmar_pedido",
      params: { fullName: "X", phone: "573009998888", address: "Y", city: "Z" },
      response_message: "",
    });
    clienteMocks.crearPedidoWompiDesdeCarrito.mockRejectedValueOnce(new Error("No hay stock suficiente"));

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await expect(procesarMensajeEntrante({})).resolves.toBeUndefined();

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("Disculpa, tuve un problema"));
    expect(console.error).toHaveBeenCalled();
  });

  it("si falla la accion de escritura confirmada, igual limpia pendingConfirmation y responde", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: { cart: [], pendingConfirmation: { action: "actualizar_precio_producto", params: { idOSku: "P1", nuevoPrecio: 50000 } } },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.21", from: "573215879805", texto: "si" });
    mocks.actualizarPrecioProducto.mockRejectedValueOnce(new Error("fallo de base de datos"));

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.guardarSesion).toHaveBeenCalledWith("sesion-1", expect.objectContaining({ pendingConfirmation: null }));
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573215879805", expect.stringContaining("Disculpa, tuve un problema"));
  });

  it("no deja escapar el error si falla el envio de la respuesta por WhatsApp", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.22", from: "573009998888", texto: "hola" });
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola!" });
    mocks.enviarTexto.mockRejectedValueOnce(new Error("Graph API caida"));

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await expect(procesarMensajeEntrante({})).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("si el agente devuelve action 'error' para el dueño, usa su response_message y no el respaldo generico", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.23", from: "573215879805", texto: "ventas de hoy" });
    mocks.decidirAccion.mockResolvedValue({ action: "error", params: {}, response_message: "Disculpa, OpenAI no respondio." });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573215879805", "Disculpa, OpenAI no respondio.");
  });
});

describe("ejecutarAccionCliente via procesarMensajeEntrante", () => {
  it("agrega un producto al carrito con nombre y precio de la base de datos, ignorando unitPrice/nombre del modelo", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.10", from: "573009998888", texto: "agrega la pijama rosa" });
    mocks.decidirAccion.mockResolvedValue({
      action: "agregar_al_carrito",
      params: { productId: PRODUCTO_ID, variantId: VARIANTE_ID, qty: 2, unitPrice: 1, nombre: "Nombre inventado" },
      response_message: "Agregando...",
    });
    clienteMocks.obtenerProductoParaCarrito.mockResolvedValue({
      productId: PRODUCTO_ID, variantId: VARIANTE_ID, nombre: "Pijama Rosa (Talla M)", precio: 89900, stock: 5, imageId: null,
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.obtenerProductoParaCarrito).toHaveBeenCalledWith(PRODUCTO_ID, VARIANTE_ID);
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("179.800"));
    expect(mocks.guardarSesion).toHaveBeenCalledWith("sesion-1", expect.objectContaining({
      cart: [{ productId: PRODUCTO_ID, variantId: VARIANTE_ID, imageId: null, qty: 2, unitPrice: 89900, nameSnapshot: "Pijama Rosa (Talla M)" }],
    }));
  });

  it("rechaza con un mensaje amable un agregar_al_carrito con params invalidos (sin consultar la base de datos)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.10b", from: "573009998888", texto: "agrega la rosa" });
    mocks.decidirAccion.mockResolvedValue({
      action: "agregar_al_carrito",
      params: { productId: "pijama-rosa", qty: 1 },
      response_message: "",
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.obtenerProductoParaCarrito).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("no entendí qué producto"));
    expect(mocks.guardarSesion).not.toHaveBeenCalledWith("sesion-1", expect.objectContaining({ cart: [expect.anything()] }));
  });

  it("rechaza con un mensaje amable una variante que no pertenece al producto (no la agrega)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.10c", from: "573009998888", texto: "agrega esa" });
    mocks.decidirAccion.mockResolvedValue({
      action: "agregar_al_carrito",
      params: { productId: PRODUCTO_ID, variantId: VARIANTE_ID, qty: 1 },
      response_message: "",
    });
    clienteMocks.obtenerProductoParaCarrito.mockResolvedValue(null);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("No encontré ese producto"));
    expect(mocks.guardarSesion).not.toHaveBeenCalledWith("sesion-1", expect.objectContaining({ cart: [expect.anything()] }));
  });

  it("no agrega mas unidades de las que hay en stock", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.10d", from: "573009998888", texto: "quiero 10" });
    mocks.decidirAccion.mockResolvedValue({
      action: "agregar_al_carrito",
      params: { productId: PRODUCTO_ID, variantId: null, qty: 10 },
      response_message: "",
    });
    clienteMocks.obtenerProductoParaCarrito.mockResolvedValue({
      productId: PRODUCTO_ID, variantId: null, nombre: "Pijama Rosa", precio: 89900, stock: 3, imageId: null,
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("3"));
    expect(mocks.guardarSesion).not.toHaveBeenCalledWith("sesion-1", expect.objectContaining({ cart: [expect.anything()] }));
  });

  it("pasa a decidirAccion el historial reciente de la conversacion, excluyendo el mensaje actual", async () => {
    const historial = [
      { direction: "inbound", message_body: "tienen batas?" },
      { direction: "outbound", message_body: `1. Bata [productId:${PRODUCTO_ID}]` },
    ];
    mocks.cargarHistorial.mockResolvedValue(historial);
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.10f", from: "573009998888", texto: "agrega la 1" });
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "ok" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.cargarHistorial).toHaveBeenCalledWith("573009998888", "wamid.10f");
    expect(mocks.decidirAccion).toHaveBeenCalledWith(expect.objectContaining({ historial, mensajeEntrante: "agrega la 1" }));
  });

  it("manda el catalogo como documento ademas del texto", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.11", from: "573009998888", texto: "mandame el catalogo" });
    mocks.decidirAccion.mockResolvedValue({ action: "generar_catalogo_pdf", params: {}, response_message: "" });
    clienteMocks.generarCatalogoPdf.mockResolvedValue([{ link: "https://x/catalogo-firmado.pdf", filename: "catalogo-merylay.pdf" }]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573009998888", "https://x/catalogo-firmado.pdf", "catalogo-merylay.pdf");
  });

  it("si el catalogo cruza varias categorias y llegan varios documentos, manda cada uno por separado (bug real: un solo PDF con todo mezclado era dificil de leer y topaba el presupuesto de CPU de la Edge Function)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.11b", from: "573009998888", texto: "mandame el catalogo de camisetas tela fria" });
    mocks.decidirAccion.mockResolvedValue({ action: "generar_catalogo_pdf", params: { texto: "tela fria" }, response_message: "" });
    clienteMocks.generarCatalogoPdf.mockResolvedValue([
      { link: "https://x/catalogo-semiajustadas.pdf", filename: "catalogo-semiajustadas.pdf" },
      { link: "https://x/catalogo-manga-doblada.pdf", filename: "catalogo-manga-doblada.pdf" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573009998888", "https://x/catalogo-semiajustadas.pdf", "catalogo-semiajustadas.pdf");
    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573009998888", "https://x/catalogo-manga-doblada.pdf", "catalogo-manga-doblada.pdf");
  });

  it("confirma el pedido con el carrito de la sesion y responde con el link de pago", async () => {
    mocks.obtenerOCrearSesion.mockResolvedValue({
      id: "sesion-1",
      sessionData: {
        cart: [{ productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 89900, nameSnapshot: "Pijama Rosa" }],
        pendingConfirmation: null,
      },
    });
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.12", from: "573009998888", texto: "confirmo, mi direccion es Calle 1, Bogota" });
    mocks.decidirAccion.mockResolvedValue({
      action: "confirmar_pedido",
      params: { fullName: "Cliente Prueba", phone: "573009998888", address: "Calle 1", city: "Bogota" },
      response_message: "",
    });
    clienteMocks.crearPedidoWompiDesdeCarrito.mockResolvedValue({ linkPago: "https://x/pagar/1", orderNumber: "ML-1" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.crearPedidoWompiDesdeCarrito).toHaveBeenCalledWith(
      "perfil-1",
      [{ productId: "p1", variantId: null, imageId: null, qty: 1, unitPrice: 89900, nameSnapshot: "Pijama Rosa" }],
      { fullName: "Cliente Prueba", phone: "573009998888", address: "Calle 1", city: "Bogota" },
    );
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("https://x/pagar/1"));
  });

  it("no confirma el pedido si el carrito esta vacio", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.13", from: "573009998888", texto: "confirmo" });
    mocks.decidirAccion.mockResolvedValue({ action: "confirmar_pedido", params: { fullName: "X", phone: "573009998888", address: "Y", city: "Z" }, response_message: "" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.crearPedidoWompiDesdeCarrito).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", expect.stringContaining("carrito está vacío"));
  });

  it("usa el response_message del modelo como respaldo si la accion no es reconocida", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.14", from: "573009998888", texto: "algo raro" });
    mocks.decidirAccion.mockResolvedValue({
      action: "accion_inexistente",
      params: {},
      response_message: "No entendí tu mensaje, ¿puedes repetirlo?",
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573009998888", "No entendí tu mensaje, ¿puedes repetirlo?");
  });
});

describe("acciones de lectura del dueño con fotos/documentos", () => {
  it("consultar_productos: sin ningun filtro, pregunta en vez de llamar a la base de datos", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6a", from: "573215879805", texto: "muestrame productos" });
    mocks.decidirAccion.mockResolvedValue({ action: "consultar_productos", params: {}, response_message: "" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.consultarProductos).not.toHaveBeenCalled();
    expect(clienteMocks.enviarDocumentoPorLink).not.toHaveBeenCalled();
  });

  it("consultar_productos: pasa filtros, formato y conFotos a owner-actions tal cual", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6b", from: "573215879805", texto: "lista de camisetas talla M agregadas en los ultimos 2 dias, sin foto" });
    mocks.decidirAccion.mockResolvedValue({
      action: "consultar_productos",
      params: { texto: "camisetas", talla: "M", agregadoDesdeDias: 2, formato: "lista", conFotos: false },
      response_message: "",
    });
    mocks.consultarProductos.mockResolvedValue({ texto: "Encontré 3 producto(s)...", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.consultarProductos).toHaveBeenCalledWith(
      { texto: "camisetas", talla: "M", color: undefined, agregadoDesdeDias: 2, soloConStock: false },
      "lista",
      false,
    );
  });

  it("consultar_productos: con soloConStock, lo pasa a owner-actions (bug real: el dueño pedia 'solo con stock' y no habia forma de filtrarlo)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6z", from: "573215879805", texto: "camisetas tela fria que tengan stock" });
    mocks.decidirAccion.mockResolvedValue({
      action: "consultar_productos",
      params: { texto: "camisetas tela fria", soloConStock: true, formato: "pdf_fotos" },
      response_message: "",
    });
    mocks.consultarProductos.mockResolvedValue({ texto: "Encontré...", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.consultarProductos).toHaveBeenCalledWith(
      expect.objectContaining({ soloConStock: true }),
      "pdf_fotos",
      false,
    );
  });

  it("consultar_productos: un formato desconocido/ausente cae a 'conteo'", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6c", from: "573215879805", texto: "cuantas camisetas hay" });
    mocks.decidirAccion.mockResolvedValue({ action: "consultar_productos", params: { texto: "camisetas" }, response_message: "" });
    mocks.consultarProductos.mockResolvedValue({ texto: "Encontré...", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.consultarProductos).toHaveBeenCalledWith(expect.anything(), "conteo", false);
  });

  it("consultar_productos: un agregadoDesdeDias corrupto (NaN/negativo) se ignora en vez de corromper el filtro", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6f", from: "573215879805", texto: "camisetas agregadas no sé cuándo" });
    mocks.decidirAccion.mockResolvedValue({
      action: "consultar_productos",
      params: { texto: "camisetas", agregadoDesdeDias: "no-numero" },
      response_message: "",
    });
    mocks.consultarProductos.mockResolvedValue({ texto: "Encontré...", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.consultarProductos).toHaveBeenCalledWith(
      { texto: "camisetas", talla: undefined, color: undefined, agregadoDesdeDias: undefined, soloConStock: false },
      "conteo",
      false,
    );
  });

  it("informe_creditos llama a reports.informeCreditos con dias y conPdf", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6d", from: "573215879805", texto: "cuantos creditos hay" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_creditos", params: { dias: 30, conPdf: true }, response_message: "" });
    mocks.informeCreditos.mockResolvedValue({ texto: "Ventas a crédito: $500.000", fotos: [], documentos: [{ link: "https://x/c.pdf", filename: "informe-creditos-merylay.pdf" }] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeCreditos).toHaveBeenCalledWith(30, true);
    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573215879805", "https://x/c.pdf", "informe-creditos-merylay.pdf");
  });

  it("informe_creditos sin 'dias' en los params usa un default muy grande (ve todo el historial, no solo 30 dias)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6e", from: "573215879805", texto: "cuantos creditos hay" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_creditos", params: {}, response_message: "" });
    mocks.informeCreditos.mockResolvedValue({ texto: "Ventas a crédito: $500.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeCreditos).toHaveBeenCalledWith(3650, true);
  });

  it("informe_creditos_pendientes llama a reports.informeCreditosPendientes con conPdf, sin ningun filtro de dias", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6f", from: "573215879805", texto: "que clientas me deben" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_creditos_pendientes", params: { conPdf: true }, response_message: "" });
    mocks.informeCreditosPendientes.mockResolvedValue({ texto: "María — $100.000", fotos: [], documentos: [{ link: "https://x/cp.pdf", filename: "creditos-pendientes-merylay.pdf" }] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeCreditosPendientes).toHaveBeenCalledWith(true);
    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573215879805", "https://x/cp.pdf", "creditos-pendientes-merylay.pdf");
  });

  it("informe_creditos sin 'conPdf' en los params manda el PDF por defecto (bug real: el dueño pedia el informe de creditos y no se lo mandaba porque el modelo no dijo conPdf explicito -- el texto solo trae un total, nunca cliente/foto/abono/saldo)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6g", from: "573215879805", texto: "dame el informe de creditos" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_creditos", params: {}, response_message: "" });
    mocks.informeCreditos.mockResolvedValue({ texto: "Ventas a crédito: $500.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeCreditos).toHaveBeenCalledWith(3650, true);
  });

  it("informe_creditos con conPdf:false explicito, lo respeta (el dueño pidio solo el resumen)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6h", from: "573215879805", texto: "dame solo el total de creditos, sin pdf" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_creditos", params: { conPdf: false }, response_message: "" });
    mocks.informeCreditos.mockResolvedValue({ texto: "Ventas a crédito: $500.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeCreditos).toHaveBeenCalledWith(3650, false);
  });

  it("informe_creditos_pendientes sin 'conPdf' en los params manda el PDF por defecto", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6i", from: "573215879805", texto: "informe de clientas con credito" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_creditos_pendientes", params: {}, response_message: "" });
    mocks.informeCreditosPendientes.mockResolvedValue({ texto: "María — $100.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeCreditosPendientes).toHaveBeenCalledWith(true);
  });

  it("informe_abonos llama a reports.informeAbonos con dias y conPdf (default dias=1 si el modelo no lo manda)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6e", from: "573215879805", texto: "que cliente abono hoy" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_abonos", params: {}, response_message: "" });
    mocks.informeAbonos.mockResolvedValue({ texto: "Abonos: $50.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeAbonos).toHaveBeenCalledWith(1, false);
  });

  it("informe_ventas llama a reports.informeVentas con dias y conPdf", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3a", from: "573215879805", texto: "ventas de esta semana" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_ventas", params: { dias: 7, conPdf: true }, response_message: "" });
    mocks.informeVentas.mockResolvedValue({ texto: "Ventas: $100.000", fotos: [], documentos: [{ link: "https://x/v.pdf", filename: "informe-ventas-merylay.pdf" }] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeVentas).toHaveBeenCalledWith(7, true);
    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573215879805", "https://x/v.pdf", "informe-ventas-merylay.pdf");
  });

  it("productos_mas_vendidos llama a reports.productosMasVendidos con dias, limite y conPdf (con default de limite)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3b", from: "573215879805", texto: "que se vendio mas este mes" });
    mocks.decidirAccion.mockResolvedValue({ action: "productos_mas_vendidos", params: { dias: 30 }, response_message: "" });
    mocks.productosMasVendidos.mockResolvedValue({ texto: "1. Pijama Rosa", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.productosMasVendidos).toHaveBeenCalledWith(30, 10, false);
  });

  it("informe_clientes llama a reports.informeClientes", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3c", from: "573215879805", texto: "quienes son mis mejores clientes" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_clientes", params: { dias: 30, limite: 5, conPdf: false }, response_message: "" });
    mocks.informeClientes.mockResolvedValue({ texto: "1. Juan Pérez", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeClientes).toHaveBeenCalledWith(30, 5, false);
  });

  it("historial_cliente llama a reports.historialCliente con el nombre/telefono", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3d", from: "573215879805", texto: "que le ha comprado Juan" });
    mocks.decidirAccion.mockResolvedValue({ action: "historial_cliente", params: { nombreOTelefono: "Juan" }, response_message: "" });
    mocks.historialCliente.mockResolvedValue({ texto: "Historial de Juan: $100.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.historialCliente).toHaveBeenCalledWith("Juan");
  });

  it("informe_gastos llama a reports.informeGastos con dias y conPdf", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3e", from: "573215879805", texto: "cuanto hemos gastado este mes" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_gastos", params: { dias: 30 }, response_message: "" });
    mocks.informeGastos.mockResolvedValue({ texto: "Gastos: $580.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeGastos).toHaveBeenCalledWith(30, false);
  });

  it("productos_mas_vendidos acota 'limite' a 10 en texto aunque el modelo pida mas (ej. 100)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3f", from: "573215879805", texto: "dame los 100 productos mas vendidos del año" });
    mocks.decidirAccion.mockResolvedValue({ action: "productos_mas_vendidos", params: { dias: 365, limite: 100 }, response_message: "" });
    mocks.productosMasVendidos.mockResolvedValue({ texto: "1. Pijama Rosa", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.productosMasVendidos).toHaveBeenCalledWith(365, 10, false);
  });

  it("informe_ventas cae al default de 'dias' (todo el historico) si el modelo manda un valor no numerico", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3g", from: "573215879805", texto: "ventas de hoy" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_ventas", params: { dias: "no-numero", conPdf: false }, response_message: "" });
    mocks.informeVentas.mockResolvedValue({ texto: "Ventas: $100.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeVentas).toHaveBeenCalledWith(3650, false);
  });

  it("informe_ventas sin dias (el dueño no pidio ningun periodo) trae todo el historico, no solo hoy (bug real: el dueño pedia un informe sin filtro y no le mostraba todo lo que habia en la tienda)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3h", from: "573215879805", texto: "dame el informe de ventas" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_ventas", params: { conPdf: false }, response_message: "" });
    mocks.informeVentas.mockResolvedValue({ texto: "Ventas: $100.000", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeVentas).toHaveBeenCalledWith(3650, false);
  });

  it("informe_clientes sin dias (el dueño no pidio ningun periodo) trae todo el historico, no solo los ultimos 30 dias", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3i", from: "573215879805", texto: "dame el listado de clientes" });
    mocks.decidirAccion.mockResolvedValue({ action: "informe_clientes", params: { conPdf: false }, response_message: "" });
    mocks.informeClientes.mockResolvedValue({ texto: "1. Juan Pérez", fotos: [], documentos: [] });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.informeClientes).toHaveBeenCalledWith(3650, 10, false);
  });
});

describe("buscar_producto manda el carrusel nativo del catalogo de Meta", () => {
  it("con UN solo resultado, manda un mensaje de producto unico (interactive product) con su retailerId", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "¡Mira esto!" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: PRODUCTO_ID, variantId: VARIANTE_ID, nombre: "Pijama Rosa", talla: "M", color: "Rosa", precio: 89900, stock: 5, imageId: null, fotoUrl: "https://x/pijama.jpg", descripcion: null, retailerId: "SKU-PIJAMA-M" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarProductoUnico).toHaveBeenCalledWith("573001234567", expect.objectContaining({ retailerId: "SKU-PIJAMA-M" }));
    expect(mocks.enviarListaProductos).not.toHaveBeenCalled();
  });

  it("sin coincidencias, responde un mensaje claro sin mandar ningun carrusel", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.4", from: "573001234567", texto: "algo raro" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "algo raro" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarProductoUnico).not.toHaveBeenCalled();
    expect(mocks.enviarListaProductos).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("No encontré"));
  });

  it("con varios resultados, manda el carrusel nativo (product_list) agrupado por categoria", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: "p-1", variantId: null, nombre: "Pijama Rosa", talla: null, color: null, precio: 89900, stock: 5, imageId: null, fotoUrl: "https://x/p1.jpg", categoria: "Pijamas", retailerId: "SKU-P1" },
      { productId: "p-2", variantId: "v-2", nombre: "Pijama Azul", talla: "M", color: "Azul", precio: 95000, stock: 3, imageId: null, fotoUrl: "https://x/p2.jpg", categoria: "Pijamas", retailerId: "SKU-P2-M" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarListaProductos).toHaveBeenCalledWith("573001234567", expect.objectContaining({
      secciones: [{ titulo: "Pijamas", retailerIds: ["SKU-P1", "SKU-P2-M"] }],
      // WhatsApp EXIGE interactive.header en los mensajes product_list (si
      // falta, la Graph API responde 400 "#131009 interactive['header'] is
      // required") -- bug real: el carrusel se mandaba sin encabezado y la
      // clienta se quedaba sin ver nada, con el error solo en el log.
      encabezado: expect.stringMatching(/\S/),
    }));
  });

  it("si el envio del carrusel falla (ej. Graph API lo rechaza), avisa a la clienta en vez de dejarla sin respuesta", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6c", from: "573001234567", texto: "camisetas talla L" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "camiseta", talla: "L" }, response_message: "Claro, mira:" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: "p-1", variantId: null, nombre: "Camiseta Blanca", talla: "L", color: null, precio: 45000, stock: 5, imageId: null, fotoUrl: "https://x/p1.jpg", categoria: "Camisetas", retailerId: "SKU-P1" },
      { productId: "p-2", variantId: null, nombre: "Camiseta Negra", talla: "L", color: null, precio: 45000, stock: 5, imageId: null, fotoUrl: "https://x/p2.jpg", categoria: "Camisetas", retailerId: "SKU-P2" },
    ]);
    mocks.enviarListaProductos.mockRejectedValueOnce(new Error("Graph API respondio 400: interactive['header'] is required"));

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await expect(procesarMensajeEntrante({})).resolves.not.toThrow();

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", "Claro, mira:");
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("problema para mostrarte"));
  });

  it("sin categoria, agrupa bajo el titulo 'Productos'", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6b", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: "p-1", variantId: null, nombre: "Pijama Rosa", talla: null, color: null, precio: 89900, stock: 5, imageId: null, fotoUrl: "https://x/p1.jpg", categoria: null, retailerId: "SKU-P1" },
      { productId: "p-2", variantId: null, nombre: "Pijama Azul", talla: null, color: null, precio: 95000, stock: 3, imageId: null, fotoUrl: "https://x/p2.jpg", categoria: null, retailerId: "SKU-P2" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarListaProductos).toHaveBeenCalledWith("573001234567", expect.objectContaining({
      secciones: [{ titulo: "Productos", retailerIds: ["SKU-P1", "SKU-P2"] }],
      encabezado: expect.stringMatching(/\S/),
    }));
  });

  it("con mas de 30 coincidencias, trunca a 30 items en el carrusel y avisa del total en el texto", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.8", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "" });
    const productos = Array.from({ length: 31 }, (_, i) => ({
      productId: `p-${i}`, variantId: null, nombre: `Pijama ${i}`, talla: null, color: null,
      precio: 50000, stock: 1, imageId: null, fotoUrl: `https://x/p${i}.jpg`, categoria: "Pijamas", retailerId: `SKU-P${i}`,
    }));
    clienteMocks.buscarCatalogo.mockResolvedValue(productos);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    const llamada = mocks.enviarListaProductos.mock.calls[0][1] as { secciones: { retailerIds: string[] }[] };
    const totalItems = llamada.secciones.reduce((suma, s) => suma + s.retailerIds.length, 0);
    expect(totalItems).toBe(30);
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("Encontré 31 en total"));
  });
});

describe("mensaje calido antes de las tarjetas (appointment setter)", () => {
  it("usa el response_message del modelo como texto, en vez de un mensaje generico fijo", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.30", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({
      action: "buscar_producto",
      params: { consulta: "pijama" },
      response_message: "¡Hola! Qué bueno que preguntas por nuestras pijamas 💕 mira estas opciones:",
    });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: PRODUCTO_ID, variantId: null, nombre: "Pijama Rosa", talla: null, color: null, precio: 89900, stock: 5, imageId: null, fotoUrl: "https://x/pijama.jpg", descripcion: null, retailerId: "SKU-P1" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", "¡Hola! Qué bueno que preguntas por nuestras pijamas 💕 mira estas opciones:");
  });

  it("manda el texto ANTES que el carrusel de producto (saluda primero, no bombardea con fotos sin contexto)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.31", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "Aquí tienes:" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: PRODUCTO_ID, variantId: null, nombre: "Pijama Rosa", talla: null, color: null, precio: 89900, stock: 5, imageId: null, fotoUrl: "https://x/pijama.jpg", descripcion: null, retailerId: "SKU-P1" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    const ordenTexto = mocks.enviarTexto.mock.invocationCallOrder[0];
    const ordenCarrusel = mocks.enviarProductoUnico.mock.invocationCallOrder[0];
    expect(ordenTexto).toBeLessThan(ordenCarrusel);
  });

  it("si el response_message viene vacío, usa un saludo de respaldo cálido (nunca manda un texto vacío)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.33", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: PRODUCTO_ID, variantId: null, nombre: "Pijama Rosa", talla: null, color: null, precio: 89900, stock: 5, imageId: null, fotoUrl: "https://x/pijama.jpg", descripcion: null, retailerId: "SKU-P1" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.not.stringMatching(/^\s*$/));
  });
});

describe("boton 'Preguntar por WhatsApp' identifica el producto exacto por el link del mensaje", () => {
  it("con un link /producto/<slug> en el mensaje, busca por slug exacto en vez de confiar en 'consulta'", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({
      kind: "texto",
      messageId: "wamid.32",
      from: "573001234567",
      texto: "Hola, estoy interesada en este producto: Camiseta Mariposa — https://merylay.shop/producto/camiseta-mariposa",
    });
    mocks.decidirAccion.mockResolvedValue({
      action: "buscar_producto",
      params: { consulta: "camiseta" },
      response_message: "¡Hola! Qué linda elección, la Camiseta Mariposa es hermosa 💕",
    });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: PRODUCTO_ID, variantId: null, nombre: "Camiseta Mariposa", talla: null, color: null, precio: 45000, stock: 3, imageId: null, fotoUrl: "https://x/camiseta.jpg", descripcion: null },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.buscarCatalogo).toHaveBeenCalledWith(expect.objectContaining({ slug: "camiseta-mariposa" }));
  });
});

describe("generar_catalogo_pdf con filtros", () => {
  it("pasa consulta/talla/color a generarCatalogoPdf", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.5", from: "573001234567", texto: "catalogo de camisetas en talla M" });
    mocks.decidirAccion.mockResolvedValue({ action: "generar_catalogo_pdf", params: { texto: "camiseta", talla: "M" }, response_message: "" });
    clienteMocks.generarCatalogoPdf.mockResolvedValue([{ link: "https://x/catalogo.pdf", filename: "catalogo.pdf" }]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.generarCatalogoPdf).toHaveBeenCalledWith({ texto: "camiseta", talla: "M", color: undefined });
  });
});

describe("mensajes de audio", () => {
  it("transcribe el audio y procesa el texto resultante como un mensaje normal", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "audio", messageId: "wamid.AUDIO1", from: "573001234567", mediaId: "media-999" });
    mocks.transcribirAudio.mockResolvedValue("cuántas camisetas hay");
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).toHaveBeenCalledWith(expect.objectContaining({ mensajeEntrante: "cuántas camisetas hay" }));
  });

  it("si la transcripcion falla o sale vacia, responde el mensaje de fallback sin llamar a decidirAccion", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "audio", messageId: "wamid.AUDIO2", from: "573001234567", mediaId: "media-998" });
    mocks.transcribirAudio.mockRejectedValue(new Error("OpenAI respondio 500"));

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("nota de voz"));
  });
});

describe("pedido armado en el carrito nativo del catalogo (mensaje 'order')", () => {
  it("agrega cada item del pedido al carrito por su retailerId (sku), sin llamar a decidirAccion", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({
      kind: "pedido_catalogo", messageId: "wamid.ORDER1", from: "573001234567",
      items: [{ retailerId: "SKU-PIJAMA-M", cantidad: 1 }],
    });
    clienteMocks.obtenerProductoPorSku.mockResolvedValue({ productId: PRODUCTO_ID, variantId: VARIANTE_ID, nombre: "Pijama Rosa", precio: 89900, stock: 5, imageId: null });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).not.toHaveBeenCalled();
    expect(clienteMocks.obtenerProductoPorSku).toHaveBeenCalledWith("SKU-PIJAMA-M");
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("Agregado: Pijama Rosa"));
  });

  it("un pedido con varios items los agrega todos, uno por uno", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({
      kind: "pedido_catalogo", messageId: "wamid.ORDER2", from: "573001234567",
      items: [{ retailerId: "SKU-P1", cantidad: 2 }, { retailerId: "SKU-P2", cantidad: 1 }],
    });
    clienteMocks.obtenerProductoPorSku.mockImplementation(async (sku: string) =>
      sku === "SKU-P1"
        ? { productId: "p-1", variantId: null, nombre: "Pijama Rosa", precio: 89900, stock: 5, imageId: null }
        : { productId: "p-2", variantId: null, nombre: "Bata Dorada", precio: 120000, stock: 5, imageId: null },
    );

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.obtenerProductoPorSku).toHaveBeenCalledTimes(2);
    const [, respuesta] = mocks.enviarTexto.mock.calls[0];
    expect(respuesta).toContain("Pijama Rosa x2");
    expect(respuesta).toContain("Bata Dorada");
  });

  it("producto agotado responde 'agotado' sin agregarlo al carrito", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({
      kind: "pedido_catalogo", messageId: "wamid.ORDER3", from: "573001234567",
      items: [{ retailerId: "SKU-PIJAMA", cantidad: 1 }],
    });
    clienteMocks.obtenerProductoPorSku.mockResolvedValue({ productId: PRODUCTO_ID, variantId: null, nombre: "Pijama Rosa", precio: 89900, stock: 0, imageId: null });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("agotado"));
  });

  it("si un retailerId del pedido no se encuentra, avisa sin lanzar y sin bloquear los demas items", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({
      kind: "pedido_catalogo", messageId: "wamid.ORDER4", from: "573001234567",
      items: [{ retailerId: "SKU-INEXISTENTE", cantidad: 1 }],
    });
    clienteMocks.obtenerProductoPorSku.mockResolvedValue(null);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await expect(procesarMensajeEntrante({})).resolves.not.toThrow();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("No encontré"));
  });
});

describe("indicador de escribiendo", () => {
  it("activa el indicador con el messageId de un mensaje de texto", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.TYPING1", from: "573001234567", texto: "hola" });
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.marcarLeidoYEscribiendo).toHaveBeenCalledWith("wamid.TYPING1");
  });

  it("activa el indicador con el messageId de una nota de voz, antes de transcribirla", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "audio", messageId: "wamid.TYPING2", from: "573001234567", mediaId: "media-1" });
    mocks.transcribirAudio.mockResolvedValue("hola");
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.marcarLeidoYEscribiendo).toHaveBeenCalledWith("wamid.TYPING2");
    const ordenEscribiendo = mocks.marcarLeidoYEscribiendo.mock.invocationCallOrder[0];
    const ordenTranscripcion = mocks.transcribirAudio.mock.invocationCallOrder[0];
    expect(ordenEscribiendo).toBeLessThan(ordenTranscripcion);
  });

  it("activa el indicador con el messageId de un pedido del catalogo", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({
      kind: "pedido_catalogo", messageId: "wamid.TYPING3", from: "573001234567",
      items: [{ retailerId: "SKU-P1", cantidad: 1 }],
    });
    clienteMocks.obtenerProductoPorSku.mockResolvedValue({ productId: PRODUCTO_ID, variantId: null, nombre: "Pijama Rosa", precio: 89900, stock: 5, imageId: null });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.marcarLeidoYEscribiendo).toHaveBeenCalledWith("wamid.TYPING3");
  });

  it("si falla, no bloquea la respuesta real", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.TYPING4", from: "573001234567", texto: "hola" });
    mocks.marcarLeidoYEscribiendo.mockRejectedValue(new Error("Graph API caida"));
    mocks.decidirAccion.mockResolvedValue({ action: "chat", params: {}, response_message: "Hola" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await expect(procesarMensajeEntrante({})).resolves.not.toThrow();

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", "Hola");
  });
});
