import { getSupabase } from "../_shared/db.ts";
import { enviarTexto, enviarImagenPorLink, enviarDocumentoPorLink, enviarBotonProducto } from "../_shared/meta.ts";
import { parsearMensajeEntrante } from "./adapters.ts";
import { buscarOCrearCliente, normalizarTelefono, generarAccesoWeb } from "./customers.ts";
import { obtenerOCrearSesion, guardarSesion, cargarHistorial } from "./sessions.ts";
import { decidirAccion } from "./agent.ts";
import * as ownerActions from "./owner-actions.ts";
import { ACCIONES_ESCRITURA } from "./owner-actions.ts";
import { informeVentas, productosMasVendidos, informeClientes, historialCliente, informeGastos } from "./reports.ts";
import * as catalog from "./catalog.ts";
import { crearPedidoWompiDesdeCarrito } from "./orders.ts";
import { transcribirAudio } from "./voice.ts";
import type { SessionData } from "../_shared/types.ts";
import { z } from "zod";

const AFIRMACIONES = new Set(["si", "sí", "confirmo", "dale", "ok", "listo"]);

// La confirmacion puede llegar como una sola palabra ("si") o como una
// frase corta ("si, confirmo"). NO basta con mirar solo la primera
// palabra: en español "si"/"sí" puede ser tanto la afirmacion ("yes")
// como el condicional ("if"), asi que una respuesta matizada como
// "si no es necesario, cancela" o "sí pero antes dime cuánto stock
// queda" empieza con "si" sin ser en absoluto una confirmacion clara.
// Por eso exigimos que TODAS las palabras del mensaje (sin contar
// separadores/puntuacion) sean afirmaciones reconocidas: "si, confirmo"
// pasa (ambas palabras estan en el set), pero cualquier palabra ajena
// al set — "no", "necesario", "cancela", "pero", "dime", etc. — hace
// que el mensaje se trate como ambiguo/negativo y cancele la
// confirmacion pendiente en lugar de ejecutar la accion.
function esConfirmacionAfirmativa(texto: string): boolean {
  const palabras = texto.trim().toLowerCase().split(/[\s,.;!¡]+/).filter(Boolean);
  if (palabras.length === 0) return false;
  return palabras.every((palabra) => AFIRMACIONES.has(palabra));
}

function esDueno(telefono: string): "Elkin" | "Mary" | null {
  // Ambos lados de la comparacion deben normalizarse igual: `telefono`
  // ya llega normalizado a solo digitos (normalizarTelefono se aplica
  // en procesarMensajeEntrante), asi que cada numero configurado en
  // WHATSAPP_OWNER_NUMBERS tambien debe pasar por normalizarTelefono
  // antes de comparar. Sin esto, un "+" inicial copiado al configurar
  // la variable de entorno haria que un dueño real cayera al flujo de
  // cliente sin ningun error visible. filter(Boolean) evita que una
  // coma sobrante o la variable vacia produzcan una cadena vacia que
  // coincida por accidente con un `from` malformado.
  const numeros = (Deno.env.get("WHATSAPP_OWNER_NUMBERS") ?? "")
    .split(",")
    .map((n) => normalizarTelefono(n.trim()))
    .filter(Boolean);
  const [elkin, mary] = numeros;
  if (telefono === elkin) return "Elkin";
  if (telefono === mary) return "Mary";
  return null;
}

async function registrarMensaje(telefono: string, direction: "inbound" | "outbound", body: string, providerMessageId?: string): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase.from("whatsapp_messages").insert({
    phone_number: telefono,
    direction,
    message_body: body,
    provider_message_id: providerMessageId ?? null,
  });
  if (error && (error as { code?: string }).code === "23505") {
    return false; // duplicado
  }
  return true;
}

async function ejecutarAccionEscritura(accion: string, params: Record<string, unknown>): Promise<string> {
  switch (accion) {
    case "actualizar_precio_producto":
      return ownerActions.actualizarPrecioProducto(params.idOSku as string, params.nuevoPrecio as number);
    case "actualizar_stock":
      return ownerActions.actualizarStock(params.idOSku as string, params.nuevoStock as number);
    case "cambiar_estado_pedido":
      return ownerActions.cambiarEstadoPedido(params.numeroPedido as string, params.nuevoEstado as string);
    case "activar_o_desactivar_producto":
      return ownerActions.activarODesactivarProducto(params.idOSku as string, params.activo as boolean);
    default:
      throw new Error(`Accion de escritura desconocida: ${accion}`);
  }
}

// El modelo controla `dias`/`limite` por params, y puede mandar valores que
// corrompen el reporte en vez de simplemente estar ausentes: un `limite` sin
// tope produce un texto de mas de 4096 caracteres (rechazado por la Graph
// API de WhatsApp), un `limite` <= 0 corrompe el .slice() del reporte, y un
// `dias` no numerico hace que new Date(NaN).toISOString() lance un
// RangeError crudo en vez de un mensaje amable. Estos helpers normalizan
// ambos valores ANTES de pasarlos a reports.ts.
function diasValidos(valor: unknown, porDefecto: number): number {
  const n = Math.floor(Number(valor));
  return Number.isFinite(n) && n >= 1 ? n : porDefecto;
}

function limiteValido(valor: unknown, porDefecto: number, tope: number): number {
  const n = Math.floor(Number(valor));
  const base = Number.isFinite(n) && n >= 1 ? n : porDefecto;
  return Math.min(base, tope);
}

async function ejecutarAccionLectura(accion: string, params: Record<string, unknown>): Promise<ownerActions.RespuestaLectura> {
  switch (accion) {
    case "informe_ventas": {
      const dias = diasValidos(params.dias, 1);
      const resultado = await informeVentas(dias, Boolean(params.conPdf));
      return resultado;
    }
    case "productos_mas_vendidos": {
      const dias = diasValidos(params.dias, 30);
      const limite = limiteValido(params.limite, 10, 10);
      return productosMasVendidos(dias, limite, Boolean(params.conPdf));
    }
    case "informe_clientes": {
      const dias = diasValidos(params.dias, 30);
      const limite = limiteValido(params.limite, 10, 10);
      return informeClientes(dias, limite, Boolean(params.conPdf));
    }
    case "historial_cliente":
      return historialCliente(params.nombreOTelefono as string);
    case "informe_gastos": {
      const dias = diasValidos(params.dias, 30);
      return informeGastos(dias, Boolean(params.conPdf));
    }
    case "consultar_stock_bajo":
      return { texto: await ownerActions.consultarStockBajo((params.umbral as number) ?? 5), fotos: [], documentos: [] };
    case "buscar_cliente":
      return { texto: await ownerActions.buscarCliente(params.consulta as string), fotos: [], documentos: [] };
    case "consultar_pedido":
      return { texto: await ownerActions.consultarPedido(params.numeroOId as string), fotos: [], documentos: [] };
    case "buscar_inventario": {
      const filtros = {
        texto: params.texto as string | undefined,
        talla: params.talla as string | undefined,
        color: params.color as string | undefined,
      };
      // buscarCatalogo exige al menos un filtro y lanza si no lo recibe; el
      // modelo a veces manda esta accion sin ninguno (ej. confundio "informe
      // de ventas" con esta busqueda de productos). Preguntar en vez de
      // dejar que la excepcion caiga al mensaje generico de error.
      if (!filtros.texto && !filtros.talla && !filtros.color) {
        return { texto: "¿Qué producto o categoría quieres que busque? Dime el nombre, la talla o el color.", fotos: [], documentos: [] };
      }
      return ownerActions.buscarInventario(filtros, Boolean(params.conFotos));
    }
    case "generar_informe_pdf": {
      const filtros = {
        texto: params.texto as string | undefined,
        talla: params.talla as string | undefined,
        color: params.color as string | undefined,
      };
      if (!filtros.texto && !filtros.talla && !filtros.color) {
        return { texto: "¿Sobre qué producto o categoría quieres el informe? Dime un nombre, talla o color para buscar.", fotos: [], documentos: [] };
      }
      return ownerActions.generarInformePdf(filtros);
    }
    default:
      return { texto: "No reconozco esa consulta todavia.", fotos: [], documentos: [] };
  }
}

// z.guid() (cualquier uuid con forma 8-4-4-4-12) en vez de z.uuid():
// este ultimo, en zod 4, exige ademas los bits de version/variante del
// RFC 9562 y rechazaria ids validos de Postgres que no los cumplan.
const agregarAlCarritoSchema = z.object({
  productId: z.guid(),
  variantId: z.guid().nullable().optional(),
  qty: z.number().int().positive().default(1),
});

function formatearCuerpoProducto(p: catalog.ProductoEncontrado): string {
  const detalles = [p.talla ? `talla ${p.talla}` : null, p.color ? `color ${p.color}` : null].filter(Boolean);
  const sufijo = detalles.length > 0 ? ` (${detalles.join(", ")})` : "";
  return `${p.nombre}${sufijo}\n$${p.precio.toLocaleString("es-CO")} — stock: ${p.stock}`;
}

const direccionEnvioSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
});

async function agregarAlCarrito(
  sessionData: SessionData,
  productId: string,
  variantId: string | null,
  qty: number,
): Promise<string> {
  // Nombre, precio, stock e imagen salen SIEMPRE de la base de datos,
  // nunca de params: el modelo solo aporta los ids (ya validados como
  // uuid) y la cantidad.
  const producto = await catalog.obtenerProductoParaCarrito(productId, variantId);
  if (!producto) {
    return "No encontré ese producto (o esa talla/color) en el catálogo. ¿Me dices de nuevo cuál quieres?";
  }

  const existente = sessionData.cart.find(
    (i) => i.productId === producto.productId && i.variantId === producto.variantId,
  );
  const qtyTotal = (existente?.qty ?? 0) + qty;
  if (qtyTotal > producto.stock) {
    return producto.stock > 0
      ? `Solo nos quedan ${producto.stock} unidad(es) de ${producto.nombre}.`
      : `${producto.nombre} está agotado en este momento.`;
  }

  if (existente) {
    existente.qty = qtyTotal;
    existente.unitPrice = producto.precio;
    existente.nameSnapshot = producto.nombre;
  } else {
    sessionData.cart.push({
      productId: producto.productId,
      variantId: producto.variantId,
      imageId: producto.imageId,
      qty,
      unitPrice: producto.precio,
      nameSnapshot: producto.nombre,
    });
  }
  const total = sessionData.cart.reduce((suma, i) => suma + i.unitPrice * i.qty, 0);
  return `Agregado: ${producto.nombre} x${qtyTotal}. Tu carrito tiene ${sessionData.cart.length} producto(s), total $${total.toLocaleString("es-CO")}.`;
}

async function ejecutarAccionCliente(
  accion: string,
  params: Record<string, unknown>,
  profileId: string,
  sessionData: SessionData,
  mensajeDeRespaldo: string,
): Promise<{
  texto: string;
  documentos: { link: string; filename: string }[];
  botones: { fotoUrl: string; cuerpo: string; botonId: string; botonTitulo: string }[];
}> {
  switch (accion) {
    case "buscar_producto": {
      const consulta = typeof params.consulta === "string" ? params.consulta.trim() : "";
      const talla = typeof params.talla === "string" ? params.talla : undefined;
      const color = typeof params.color === "string" ? params.color : undefined;
      if (!consulta && !talla && !color) {
        return { texto: "¿Qué producto estás buscando?", documentos: [], botones: [] };
      }
      const productos = await catalog.buscarCatalogo({ texto: consulta || undefined, talla, color });
      if (productos.length === 0) {
        return { texto: `No encontré productos para esa búsqueda.`, documentos: [], botones: [] };
      }
      const TOPE = 10;
      const botones = productos.slice(0, TOPE).filter((p) => p.fotoUrl).map((p) => ({
        fotoUrl: p.fotoUrl as string,
        cuerpo: formatearCuerpoProducto(p),
        botonId: `add:${p.productId}:${p.variantId ?? "-"}`,
        botonTitulo: "Agregar al carrito",
      }));
      const truncado = productos.length > TOPE
        ? ` Encontré ${productos.length} en total — si quieres verlos todos, pídeme el catálogo en PDF.`
        : "";
      return { texto: `Te mando las opciones que encontré.${truncado}`, documentos: [], botones };
    }

    case "agregar_al_carrito": {
      const validacion = agregarAlCarritoSchema.safeParse(params);
      if (!validacion.success) {
        return { texto: "Perdona, no entendí qué producto quieres agregar, ¿puedes repetirlo?", documentos: [], botones: [] };
      }
      const { productId, variantId, qty } = validacion.data;
      const texto = await agregarAlCarrito(sessionData, productId, variantId ?? null, qty);
      return { texto, documentos: [], botones: [] };
    }

    case "quitar_del_carrito": {
      const variantId = typeof params.variantId === "string" ? params.variantId : null;
      sessionData.cart = sessionData.cart.filter(
        (item) => !(item.productId === params.productId && (variantId === null || item.variantId === variantId)),
      );
      return { texto: "Listo, lo quité del carrito.", documentos: [], botones: [] };
    }

    case "generar_catalogo_pdf": {
      const link = await catalog.generarCatalogoPdf({
        texto: params.texto as string | undefined,
        talla: params.talla as string | undefined,
        color: params.color as string | undefined,
      });
      return {
        texto: "Aquí tienes nuestro catálogo 💕",
        documentos: [{ link, filename: "catalogo-merylay.pdf" }],
        botones: [],
      };
    }

    case "generar_cotizacion_pdf": {
      if (sessionData.cart.length === 0) {
        return { texto: "Tu carrito está vacío, agrega algún producto antes de pedir la cotización.", documentos: [], botones: [] };
      }
      const link = await catalog.generarCotizacionPdf(sessionData.cart);
      return { texto: "Aquí tienes tu cotización 💕", documentos: [{ link, filename: "cotizacion-merylay.pdf" }], botones: [] };
    }

    case "confirmar_pedido": {
      if (sessionData.cart.length === 0) {
        return { texto: "Tu carrito está vacío, agrega algún producto antes de confirmar un pedido.", documentos: [], botones: [] };
      }
      const direccion = direccionEnvioSchema.safeParse(params);
      if (!direccion.success) {
        return {
          texto: "Para confirmar necesito tu nombre completo, teléfono, dirección y ciudad de envío.",
          documentos: [],
          botones: [],
        };
      }
      const { linkPago, orderNumber } = await crearPedidoWompiDesdeCarrito(profileId, sessionData.cart, direccion.data);
      sessionData.cart = [];
      return {
        texto: `Tu pedido ${orderNumber} quedó listo. Paga aquí para confirmarlo: ${linkPago}`,
        documentos: [],
        botones: [],
      };
    }

    case "generar_acceso_web": {
      const { usuario, contrasena } = await generarAccesoWeb(profileId);
      return {
        texto: `Ya puedes entrar a merylayboutique.com con el usuario ${usuario} y la contraseña ${contrasena}. Te recomendamos cambiarla después de tu primer ingreso.`,
        documentos: [],
        botones: [],
      };
    }

    default:
      return { texto: mensajeDeRespaldo, documentos: [], botones: [] };
  }
}

const MENSAJE_AUDIO_NO_ENTENDIDO = "No pude entender tu nota de voz, ¿puedes escribirla o intentarlo de nuevo?";
const REGEX_BOTON_CARRITO = /^add:([0-9a-f-]{36}):(-|[0-9a-f-]{36})$/i;

async function manejarBoton(botonId: string, sessionData: SessionData): Promise<string> {
  const match = REGEX_BOTON_CARRITO.exec(botonId);
  if (!match) {
    return "No entendí esa acción, ¿puedes escribirme qué necesitas?";
  }
  const [, productId, variantIdCrudo] = match;
  const variantId = variantIdCrudo === "-" ? null : variantIdCrudo;
  return agregarAlCarrito(sessionData, productId, variantId, 1);
}

export async function procesarMensajeEntrante(payload: unknown): Promise<void> {
  const entrante = parsearMensajeEntrante(payload);
  if (!entrante) return;

  const telefono = normalizarTelefono(entrante.from);

  if (entrante.kind === "boton") {
    const esNuevo = await registrarMensaje(telefono, "inbound", `[boton] ${entrante.botonId}`, entrante.messageId);
    if (!esNuevo) return;

    let respuesta: string;
    try {
      const { profileId } = await buscarOCrearCliente(telefono);
      const { id: sessionId, sessionData } = await obtenerOCrearSesion(telefono, profileId);
      respuesta = await manejarBoton(entrante.botonId, sessionData);
      await guardarSesion(sessionId, sessionData);
    } catch (error) {
      console.error(`[handler] Error procesando el boton ${entrante.messageId} de ${telefono}:`, error);
      respuesta = MENSAJE_ERROR_GENERICO;
    }

    try {
      await enviarTexto(telefono, respuesta);
      await registrarMensaje(telefono, "outbound", respuesta);
    } catch (error) {
      console.error(`[handler] No se pudo enviar/registrar la respuesta a ${telefono}:`, error);
    }
    return;
  }

  let texto: string;
  if (entrante.kind === "audio") {
    try {
      texto = await transcribirAudio(entrante.mediaId);
    } catch (error) {
      console.error(`[handler] Error transcribiendo el audio ${entrante.messageId} de ${telefono}:`, error);
      texto = "";
    }
    if (!texto.trim()) {
      const esNuevo = await registrarMensaje(telefono, "inbound", "[nota de voz sin transcribir]", entrante.messageId);
      if (esNuevo) {
        try {
          await enviarTexto(telefono, MENSAJE_AUDIO_NO_ENTENDIDO);
          await registrarMensaje(telefono, "outbound", MENSAJE_AUDIO_NO_ENTENDIDO);
        } catch (error) {
          console.error(`[handler] No se pudo enviar/registrar la respuesta a ${telefono}:`, error);
        }
      }
      return;
    }
  } else {
    texto = entrante.texto;
  }

  const esNuevo = await registrarMensaje(telefono, "inbound", texto, entrante.messageId);
  if (!esNuevo) return; // ya procesado antes (reintento de Meta)

  // A partir de aqui el mensaje ya quedo marcado como procesado (Meta no
  // lo va a reintentar), asi que cualquier excepcion sin capturar dejaria
  // al usuario sin ninguna respuesta. Se captura todo, se registra el
  // error real y se responde con una disculpa generica.
  let respuesta: string;
  try {
    respuesta = await generarRespuesta(telefono, { messageId: entrante.messageId, texto });
  } catch (error) {
    console.error(`[handler] Error procesando el mensaje ${entrante.messageId} de ${telefono}:`, error);
    respuesta = MENSAJE_ERROR_GENERICO;
  }

  try {
    await enviarTexto(telefono, respuesta);
    await registrarMensaje(telefono, "outbound", respuesta);
  } catch (error) {
    console.error(`[handler] No se pudo enviar/registrar la respuesta a ${telefono}:`, error);
  }
}

const MENSAJE_ERROR_GENERICO = "Disculpa, tuve un problema procesando tu mensaje. Intenta de nuevo en un momento.";

async function generarRespuesta(
  telefono: string,
  entrante: { messageId: string; texto: string },
): Promise<string> {
  const nombreDueno = esDueno(telefono);
  const rol = nombreDueno ? "owner" : "customer";

  const { profileId } = await buscarOCrearCliente(telefono);
  const { id: sessionId, sessionData } = await obtenerOCrearSesion(telefono, profileId);

  if (sessionData.pendingConfirmation) {
    if (esConfirmacionAfirmativa(entrante.texto)) {
      const { action, params } = sessionData.pendingConfirmation;
      // La confirmacion pendiente se consume SIEMPRE, aunque la accion
      // falle: si quedara colgada, un "si" posterior sin relacion la
      // volveria a disparar.
      try {
        return await ejecutarAccionEscritura(action, params);
      } finally {
        sessionData.pendingConfirmation = null;
        await guardarSesion(sessionId, sessionData);
      }
    }
    sessionData.pendingConfirmation = null;
    await guardarSesion(sessionId, sessionData);
    return "Entendido, no hice ningún cambio. ¿En qué más te ayudo?";
  }

  const historial = await cargarHistorial(telefono, entrante.messageId);
  const decision = await decidirAccion({
    rol,
    nombreDueno: nombreDueno ?? undefined,
    historial,
    mensajeEntrante: entrante.texto,
  });

  // "chat" es una respuesta libre y "error" trae la disculpa que ya armo
  // decidirAccion: en ambos casos se usa response_message tal cual.
  if (decision.action === "chat" || decision.action === "error") {
    return decision.response_message;
  }

  if (rol === "owner") {
    if (ACCIONES_ESCRITURA.has(decision.action)) {
      sessionData.pendingConfirmation = { action: decision.action, params: decision.params };
      await guardarSesion(sessionId, sessionData);
      return `¿Confirmas esta acción? ${decision.action} con ${JSON.stringify(decision.params)}. Responde "sí" para confirmar.`;
    }
    const resultadoLectura = await ejecutarAccionLectura(decision.action, decision.params);
    for (const foto of resultadoLectura.fotos) {
      await enviarImagenPorLink(telefono, foto.url, foto.caption);
    }
    for (const documento of resultadoLectura.documentos) {
      await enviarDocumentoPorLink(telefono, documento.link, documento.filename);
    }
    return resultadoLectura.texto;
  }

  const resultado = await ejecutarAccionCliente(decision.action, decision.params, profileId, sessionData, decision.response_message);
  await guardarSesion(sessionId, sessionData);
  for (const boton of resultado.botones) {
    await enviarBotonProducto(telefono, boton);
  }
  for (const documento of resultado.documentos) {
    await enviarDocumentoPorLink(telefono, documento.link, documento.filename);
  }
  return resultado.texto;
}
