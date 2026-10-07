import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parsearMensajeEntrante: vi.fn(),
  buscarOCrearCliente: vi.fn(),
  obtenerOCrearSesion: vi.fn(),
  guardarSesion: vi.fn(),
  cargarHistorial: vi.fn(),
  decidirAccion: vi.fn(),
  enviarTexto: vi.fn(),
  enviarImagenPorLink: vi.fn(),
  enviarBotonProducto: vi.fn(),
  consultarStockBajo: vi.fn(),
  actualizarPrecioProducto: vi.fn(),
  buscarInventario: vi.fn(),
  generarInformePdf: vi.fn(),
  transcribirAudio: vi.fn(),
}));

const clienteMocks = vi.hoisted(() => ({
  buscarCatalogo: vi.fn(),
  obtenerProductoParaCarrito: vi.fn(),
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
vi.mock("./agent.ts", () => ({ decidirAccion: mocks.decidirAccion }));
vi.mock("../_shared/meta.ts", () => ({
  enviarTexto: mocks.enviarTexto,
  enviarImagenPorLink: mocks.enviarImagenPorLink,
  enviarBotonProducto: mocks.enviarBotonProducto,
  enviarDocumentoPorLink: clienteMocks.enviarDocumentoPorLink,
}));
vi.mock("./owner-actions.ts", () => ({
  consultarStockBajo: mocks.consultarStockBajo,
  actualizarPrecioProducto: mocks.actualizarPrecioProducto,
  buscarInventario: mocks.buscarInventario,
  generarInformePdf: mocks.generarInformePdf,
  ACCIONES_ESCRITURA: new Set(["actualizar_precio_producto"]),
}));
vi.mock("./catalog.ts", () => ({
  buscarCatalogo: clienteMocks.buscarCatalogo,
  obtenerProductoParaCarrito: clienteMocks.obtenerProductoParaCarrito,
  generarCatalogoPdf: clienteMocks.generarCatalogoPdf,
  generarCotizacionPdf: clienteMocks.generarCotizacionPdf,
}));
vi.mock("./orders.ts", () => ({ crearPedidoWompiDesdeCarrito: clienteMocks.crearPedidoWompiDesdeCarrito }));
vi.mock("./voice.ts", () => ({ transcribirAudio: mocks.transcribirAudio }));

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
    clienteMocks.generarCatalogoPdf.mockResolvedValue("https://x/catalogo-firmado.pdf");

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573009998888", "https://x/catalogo-firmado.pdf", "catalogo-merylay.pdf");
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
  it("buscar_inventario manda las fotos antes del texto final, pasando conFotos al llamar a ownerActions", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.1", from: "573215879805", texto: "muestrame las camisetas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_inventario", params: { texto: "camiseta", conFotos: true }, response_message: "" });
    mocks.buscarInventario.mockResolvedValue({
      texto: "Encontré 2 producto(s) con 4 unidad(es) en stock en total.",
      fotos: [{ url: "https://x/a.jpg", caption: "Camiseta A" }],
      documentos: [],
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.buscarInventario).toHaveBeenCalledWith({ texto: "camiseta", talla: undefined, color: undefined }, true);
    expect(mocks.enviarImagenPorLink).toHaveBeenCalledWith("573215879805", "https://x/a.jpg", "Camiseta A");
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573215879805", "Encontré 2 producto(s) con 4 unidad(es) en stock en total.");
  });

  it("buscar_inventario sin conFotos en los params lo pasa como false (pregunta de solo conteo)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.1b", from: "573215879805", texto: "cuantas camisetas hay" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_inventario", params: { texto: "camiseta" }, response_message: "" });
    mocks.buscarInventario.mockResolvedValue({
      texto: "Encontré 2 producto(s) con 4 unidad(es) en stock en total.",
      fotos: [],
      documentos: [],
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.buscarInventario).toHaveBeenCalledWith({ texto: "camiseta", talla: undefined, color: undefined }, false);
    expect(mocks.enviarImagenPorLink).not.toHaveBeenCalled();
  });

  it("generar_informe_pdf manda el documento", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.2", from: "573215879805", texto: "mandame el informe" });
    mocks.decidirAccion.mockResolvedValue({ action: "generar_informe_pdf", params: { texto: "camiseta" }, response_message: "" });
    mocks.generarInformePdf.mockResolvedValue({
      texto: "Aquí tienes el informe 📋",
      fotos: [],
      documentos: [{ link: "https://x/informe.pdf", filename: "informe-merylay.pdf" }],
    });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(clienteMocks.enviarDocumentoPorLink).toHaveBeenCalledWith("573215879805", "https://x/informe.pdf", "informe-merylay.pdf");
  });
});

describe("buscar_producto con tarjetas de foto y boton", () => {
  it("manda hasta 10 tarjetas con foto, cuerpo y boton 'Agregar al carrito'", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.3", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: PRODUCTO_ID, variantId: VARIANTE_ID, nombre: "Pijama Rosa", talla: "M", color: "Rosa", precio: 89900, stock: 5, imageId: null, fotoUrl: "https://x/pijama.jpg" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarBotonProducto).toHaveBeenCalledWith("573001234567", {
      fotoUrl: "https://x/pijama.jpg",
      cuerpo: expect.stringContaining("Pijama Rosa"),
      botonId: `add:${PRODUCTO_ID}:${VARIANTE_ID}`,
      botonTitulo: "Agregar al carrito",
    });
  });

  it("sin coincidencias, responde un mensaje claro sin mandar ningun boton", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.4", from: "573001234567", texto: "algo raro" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "algo raro" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarBotonProducto).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("No encontré"));
  });

  it("manda un boton por cada producto encontrado cuando hay varios", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.6", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: "p-1", variantId: null, nombre: "Pijama Rosa", talla: null, color: null, precio: 89900, stock: 5, imageId: null, fotoUrl: "https://x/p1.jpg" },
      { productId: "p-2", variantId: "v-2", nombre: "Pijama Azul", talla: "M", color: "Azul", precio: 95000, stock: 3, imageId: null, fotoUrl: "https://x/p2.jpg" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarBotonProducto).toHaveBeenCalledTimes(2);
    expect(mocks.enviarBotonProducto).toHaveBeenNthCalledWith(1, "573001234567", expect.objectContaining({
      fotoUrl: "https://x/p1.jpg",
      botonId: "add:p-1:-",
    }));
    expect(mocks.enviarBotonProducto).toHaveBeenNthCalledWith(2, "573001234567", expect.objectContaining({
      fotoUrl: "https://x/p2.jpg",
      botonId: "add:p-2:v-2",
    }));
  });

  it("excluye del boton los productos sin fotoUrl", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.7", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "" });
    clienteMocks.buscarCatalogo.mockResolvedValue([
      { productId: "p-sin-foto", variantId: null, nombre: "Pijama Sin Foto", talla: null, color: null, precio: 70000, stock: 2, imageId: null, fotoUrl: null },
      { productId: "p-con-foto", variantId: null, nombre: "Pijama Con Foto", talla: null, color: null, precio: 80000, stock: 1, imageId: null, fotoUrl: "https://x/con-foto.jpg" },
    ]);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarBotonProducto).toHaveBeenCalledTimes(1);
    expect(mocks.enviarBotonProducto).toHaveBeenCalledWith("573001234567", expect.objectContaining({
      fotoUrl: "https://x/con-foto.jpg",
      botonId: "add:p-con-foto:-",
    }));
  });

  it("con mas de 10 coincidencias, manda a lo sumo 10 botones y avisa del total en el texto", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.8", from: "573001234567", texto: "pijamas" });
    mocks.decidirAccion.mockResolvedValue({ action: "buscar_producto", params: { consulta: "pijama" }, response_message: "" });
    const productos = Array.from({ length: 11 }, (_, i) => ({
      productId: `p-${i}`, variantId: null, nombre: `Pijama ${i}`, talla: null, color: null,
      precio: 50000, stock: 1, imageId: null, fotoUrl: `https://x/p${i}.jpg`,
    }));
    clienteMocks.buscarCatalogo.mockResolvedValue(productos);

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarBotonProducto).toHaveBeenCalledTimes(10);
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("Encontré 11 en total"));
  });
});

describe("generar_catalogo_pdf con filtros", () => {
  it("pasa consulta/talla/color a generarCatalogoPdf", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "texto", messageId: "wamid.5", from: "573001234567", texto: "catalogo de camisetas en talla M" });
    mocks.decidirAccion.mockResolvedValue({ action: "generar_catalogo_pdf", params: { texto: "camiseta", talla: "M" }, response_message: "" });
    clienteMocks.generarCatalogoPdf.mockResolvedValue("https://x/catalogo.pdf");

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

describe("boton 'Agregar al carrito'", () => {
  it("agrega el producto/variante al carrito sin llamar a decidirAccion", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "boton", messageId: "wamid.BOTON1", from: "573001234567", botonId: `add:${PRODUCTO_ID}:${VARIANTE_ID}` });
    clienteMocks.obtenerProductoParaCarrito.mockResolvedValue({ productId: PRODUCTO_ID, variantId: VARIANTE_ID, nombre: "Pijama Rosa", precio: 89900, stock: 5, imageId: null });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.decidirAccion).not.toHaveBeenCalled();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("Agregado: Pijama Rosa"));
  });

  it("dos toques distintos del mismo boton suman cantidad (no fallan ni duplican la fila)", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "boton", messageId: "wamid.BOTON2", from: "573001234567", botonId: `add:${PRODUCTO_ID}:${VARIANTE_ID}` });
    clienteMocks.obtenerProductoParaCarrito.mockResolvedValue({ productId: PRODUCTO_ID, variantId: VARIANTE_ID, nombre: "Pijama Rosa", precio: 89900, stock: 5, imageId: null });
    const sessionData = { cart: [{ productId: PRODUCTO_ID, variantId: VARIANTE_ID, imageId: null, qty: 1, unitPrice: 89900, nameSnapshot: "Pijama Rosa" }], pendingConfirmation: null };
    mocks.obtenerOCrearSesion.mockResolvedValue({ id: "sesion-1", sessionData });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("x2"));
  });

  it("producto agotado responde 'agotado' sin agregarlo al carrito", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "boton", messageId: "wamid.BOTON3", from: "573001234567", botonId: `add:${PRODUCTO_ID}:-` });
    clienteMocks.obtenerProductoParaCarrito.mockResolvedValue({ productId: PRODUCTO_ID, variantId: null, nombre: "Pijama Rosa", precio: 89900, stock: 0, imageId: null });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await procesarMensajeEntrante({});

    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.stringContaining("agotado"));
  });

  it("boton con id malformado responde un mensaje generico sin lanzar", async () => {
    mocks.parsearMensajeEntrante.mockReturnValue({ kind: "boton", messageId: "wamid.BOTON4", from: "573001234567", botonId: "algo-inesperado" });

    const { procesarMensajeEntrante } = await import("./handler.ts");
    await expect(procesarMensajeEntrante({})).resolves.not.toThrow();
    expect(mocks.enviarTexto).toHaveBeenCalledWith("573001234567", expect.any(String));
    expect(clienteMocks.obtenerProductoParaCarrito).not.toHaveBeenCalled();
  });
});
