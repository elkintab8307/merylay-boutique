import { getSupabase } from "../_shared/db.ts";
import { enviarTexto, enviarImagenPorLink, enviarDocumentoPorLink, enviarListaProductos, enviarProductoUnico, marcarLeidoYEscribiendo } from "../_shared/meta.ts";
import { parsearMensajeEntrante } from "./adapters.ts";
import { buscarOCrearCliente, normalizarTelefono, generarAccesoWeb } from "./customers.ts";
import { obtenerOCrearSesion, guardarSesion, cargarHistorial } from "./sessions.ts";
import { cargarMemoria, guardarMemoria } from "./memory.ts";
import { decidirAccion } from "./agent.ts";
import * as ownerActions from "./owner-actions.ts";
import { ACCIONES_ESCRITURA } from "./owner-actions.ts";
import { informeVentas, productosMasVendidos, informeClientes, historialCliente, informeGastos, informeCreditos, informeCreditosPendientes, informeAbonos } from "./reports.ts";
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

// A diferencia de Boolean(params.conPdf) (que trata "el modelo no mando
// nada" igual que "el modelo mando false"), esto distingue ambos casos:
// solo un `false` EXPLICITO desactiva el PDF. Usado por informes donde el
// texto por si solo es casi inutil (un total/conteo, sin cliente/foto/
// detalle) -- bug real: el dueño pedia el informe de creditos sin decir
// "pdf" literalmente, el modelo no mandaba conPdf, y Boolean(undefined)
// lo apagaba en silencio.
function conPdfPorDefecto(valor: unknown, porDefecto: boolean): boolean {
  return typeof valor === "boolean" ? valor : porDefecto;
}

// A diferencia de diasValidos/limiteValido, agregadoDesdeDias es un filtro
// OPCIONAL sin default razonable: ausente significa "no filtrar por fecha",
// no "usar N dias". Un valor presente pero corrupto (NaN, <1, no numerico)
// se trata igual que ausente -- se ignora -- en vez de corromper el filtro
// de fecha en catalog.ts o rechazar toda la solicitud.
function agregadoDesdeDiasValido(valor: unknown): number | undefined {
  if (valor === undefined || valor === null) return undefined;
  const n = Math.floor(Number(valor));
  return Number.isFinite(n) && n >= 1 ? n : undefined;
}

async function ejecutarAccionLectura(accion: string, params: Record<string, unknown>): Promise<ownerActions.RespuestaLectura> {
  switch (accion) {
    case "informe_ventas": {
      // Sin periodo mencionado, el dueño espera ver TODO el historico de
      // ventas, no solo las de hoy -- mismo criterio ya aplicado a
      // informe_creditos (bug real: pedia un informe sin filtro y el bot
      // le mostraba un recorte silencioso en vez de todo lo que hay).
      const dias = diasValidos(params.dias, 3650);
      const resultado = await informeVentas(dias, Boolean(params.conPdf));
      return resultado;
    }
    case "productos_mas_vendidos": {
      const dias = diasValidos(params.dias, 30);
      const limite = limiteValido(params.limite, 10, 10);
      return productosMasVendidos(dias, limite, Boolean(params.conPdf));
    }
    case "informe_clientes": {
      // Mismo criterio que informe_ventas/informe_creditos: sin periodo
      // mencionado, todo el historico, no solo los ultimos 30 dias.
      const dias = diasValidos(params.dias, 3650);
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
    case "agregar_nota_cliente":
      return { texto: await ownerActions.agregarNotaCliente(params.nombreOTelefono as string, params.nota as string), fotos: [], documentos: [] };
    case "consultar_pedido":
      return { texto: await ownerActions.consultarPedido(params.numeroOId as string), fotos: [], documentos: [] };
    case "consultar_productos": {
      const filtros = {
        texto: params.texto as string | undefined,
        talla: params.talla as string | undefined,
        color: params.color as string | undefined,
        agregadoDesdeDias: agregadoDesdeDiasValido(params.agregadoDesdeDias),
        soloConStock: Boolean(params.soloConStock),
      };
      if (!filtros.texto && !filtros.talla && !filtros.color && !filtros.agregadoDesdeDias) {
        return { texto: "¿Qué producto o categoría quieres que busque? Dime el nombre, la talla, el color, o desde cuándo se agregó.", fotos: [], documentos: [] };
      }
      const formatosValidos = ["conteo", "lista", "pdf_fotos", "pdf_tabla"];
      const formato = formatosValidos.includes(params.formato as string)
        ? (params.formato as "conteo" | "lista" | "pdf_fotos" | "pdf_tabla")
        : "conteo";
      return ownerActions.consultarProductos(filtros, formato, Boolean(params.conFotos));
    }
    case "informe_creditos": {
      // Sin periodo mencionado, "cuantos creditos hay" debe ver TODOS los
      // creditos reales del negocio, no solo los ultimos 30 dias (bug real:
      // una venta a credito de hace mas de 30 dias con saldo pendiente real
      // quedaba excluida en silencio). ~10 anios cubre toda la historia del
      // negocio sin tener que redefinir la semantica de informeCreditos.
      const dias = diasValidos(params.dias, 3650);
      // El texto de informeCreditos es solo un total/conteo -- cliente,
      // foto, fecha, abono y saldo SOLO existen en el PDF. conPdf por
      // defecto true: lo que de verdad pidio el dueño (ver el bug real en
      // el comentario de conPdfPorDefecto) rara vez es el total a secas.
      return informeCreditos(dias, conPdfPorDefecto(params.conPdf, true));
    }
    case "informe_creditos_pendientes":
      return informeCreditosPendientes(conPdfPorDefecto(params.conPdf, true));
    case "informe_abonos": {
      const dias = diasValidos(params.dias, 1);
      return informeAbonos(dias, Boolean(params.conPdf));
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

const direccionEnvioSchema = z.object({
  fullName: z.string().min(1),
  phone: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
});

// Aplica un producto YA RESUELTO (con nombre/precio/stock reales de la base
// de datos) al carrito -- no vuelve a consultar nada. Compartida por
// agregarAlCarrito (que resuelve por productId/variantId) y
// manejarPedidoCatalogo (que resuelve por retailerId/sku): evitar que cada
// una vuelva a buscar el producto por su propio camino cuando la otra ya lo
// hizo es lo que mantiene esto en una sola fuente de verdad por llamada.
function aplicarAlCarrito(sessionData: SessionData, producto: catalog.ProductoParaCarrito, qty: number): string {
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
  return aplicarAlCarrito(sessionData, producto, qty);
}

// El cliente arma su propio carrito tocando productos en el carrusel nativo
// del catalogo y lo envia ("Enviar al vendedor") -- eso llega como un
// mensaje "order" con un item por producto (ver adapters.ts). Cada
// retailerId (sku) se resuelve a un producto/variante real y se agrega con
// la MISMA funcion agregarAlCarrito (mismo chequeo de stock/duplicados) que
// usa el flujo de agregar por texto libre.
async function manejarPedidoCatalogo(
  items: { retailerId: string; cantidad: number }[],
  sessionData: SessionData,
): Promise<string> {
  const mensajes: string[] = [];
  for (const item of items) {
    const producto = await catalog.obtenerProductoPorSku(item.retailerId);
    if (!producto) {
      mensajes.push(`No encontré uno de los productos que elegiste (código ${item.retailerId}), así que no lo pude agregar.`);
      continue;
    }
    mensajes.push(aplicarAlCarrito(sessionData, producto, item.cantidad));
  }
  return mensajes.join("\n\n");
}

interface RespuestaSaliente {
  texto: string;
  documentos: { link: string; filename: string }[];
  carrusel:
    | { tipo: "unico"; retailerId: string }
    | { tipo: "lista"; encabezado: string; secciones: { titulo: string; retailerIds: string[] }[] }
    | null;
}

const SALUDO_RESPALDO_PRODUCTO = "¡Aquí tienes lo que encontré para ti! 💕";
const TOPE_CARRUSEL = 30;

// Agrupa los resultados en secciones por categoria (WhatsApp exige al menos
// un titulo de seccion en product_list) -- "Productos" como titulo cuando
// no hay categoria. Limite real de la API: 30 items y 10 secciones.
function agruparParaCarrusel(productos: catalog.ProductoEncontrado[]): { titulo: string; retailerIds: string[] }[] {
  const porCategoria = new Map<string, string[]>();
  for (const p of productos.slice(0, TOPE_CARRUSEL)) {
    const titulo = p.categoria ?? "Productos";
    const lista = porCategoria.get(titulo) ?? [];
    lista.push(p.retailerId);
    porCategoria.set(titulo, lista);
  }
  return [...porCategoria.entries()].slice(0, 10).map(([titulo, retailerIds]) => ({ titulo, retailerIds }));
}

async function ejecutarAccionCliente(
  accion: string,
  params: Record<string, unknown>,
  profileId: string,
  sessionData: SessionData,
  mensajeDeRespaldo: string,
  slugProducto: string | null,
): Promise<RespuestaSaliente> {
  switch (accion) {
    case "buscar_producto": {
      const consulta = typeof params.consulta === "string" ? params.consulta.trim() : "";
      const talla = typeof params.talla === "string" ? params.talla : undefined;
      const color = typeof params.color === "string" ? params.color : undefined;
      if (!slugProducto && !consulta && !talla && !color) {
        return { texto: "¿Qué producto estás buscando?", documentos: [], carrusel: null };
      }
      // Si el mensaje trae el link de "Preguntar por WhatsApp" de una pagina
      // de producto, se busca por slug EXACTO en vez de por el texto libre
      // que el modelo haya extraido como "consulta" -- el modelo puede
      // parafrasear o generalizar el nombre (ej. "camiseta" en vez de
      // "Camiseta Mariposa"), lo que antes devolvia TODO un rango de
      // camisetas en vez del producto puntual que la clienta pidio ver.
      const productos = await catalog.buscarCatalogo(
        slugProducto ? { slug: slugProducto, talla, color } : { texto: consulta || undefined, talla, color },
      );
      if (productos.length === 0) {
        return {
          texto: "No encontré ese producto en este momento, pero cuéntame qué buscas y te ayudo a encontrar algo ideal para ti 💕",
          documentos: [],
          carrusel: null,
        };
      }
      // El texto cercano y especifico lo escribe el modelo (response_message)
      // -- se manda ANTES que el carrusel (ver procesarMensajeEntrante), asi
      // la clienta recibe un saludo/reconocimiento primero y no un bombardeo
      // de fotos sin contexto. Solo se usa un saludo generico de respaldo si
      // el modelo no escribio nada.
      const saludo = mensajeDeRespaldo.trim() || SALUDO_RESPALDO_PRODUCTO;

      if (productos.length === 1) {
        return { texto: saludo, documentos: [], carrusel: { tipo: "unico", retailerId: productos[0].retailerId } };
      }
      const truncado = productos.length > TOPE_CARRUSEL
        ? ` Encontré ${productos.length} en total — si quieres verlos todos, pídeme el catálogo en PDF.`
        : "";
      const secciones = agruparParaCarrusel(productos);
      // WhatsApp exige interactive.header en product_list -- si solo hay una
      // categoria se usa su nombre, si hay varias un encabezado generico
      // (nunca se manda vacio: la Graph API lo rechaza con 400 #131009).
      const encabezado = secciones.length === 1 ? secciones[0].titulo : "Nuestras opciones para ti";
      return {
        texto: `${saludo}${truncado}`,
        documentos: [],
        carrusel: { tipo: "lista", encabezado, secciones },
      };
    }

    case "agregar_al_carrito": {
      const validacion = agregarAlCarritoSchema.safeParse(params);
      if (!validacion.success) {
        return { texto: "Perdona, no entendí qué producto quieres agregar, ¿puedes repetirlo?", documentos: [], carrusel: null };
      }
      const { productId, variantId, qty } = validacion.data;
      const texto = await agregarAlCarrito(sessionData, productId, variantId ?? null, qty);
      return { texto, documentos: [], carrusel: null };
    }

    case "quitar_del_carrito": {
      const variantId = typeof params.variantId === "string" ? params.variantId : null;
      sessionData.cart = sessionData.cart.filter(
        (item) => !(item.productId === params.productId && (variantId === null || item.variantId === variantId)),
      );
      return { texto: "Listo, lo quité del carrito.", documentos: [], carrusel: null };
    }

    case "generar_catalogo_pdf": {
      const documentos = await catalog.generarCatalogoPdf({
        texto: params.texto as string | undefined,
        talla: params.talla as string | undefined,
        color: params.color as string | undefined,
      });
      return {
        texto: "Aquí tienes nuestro catálogo 💕",
        documentos,
        carrusel: null,
      };
    }

    case "generar_cotizacion_pdf": {
      if (sessionData.cart.length === 0) {
        return { texto: "Tu carrito está vacío, agrega algún producto antes de pedir la cotización.", documentos: [], carrusel: null };
      }
      const link = await catalog.generarCotizacionPdf(sessionData.cart);
      return { texto: "Aquí tienes tu cotización 💕", documentos: [{ link, filename: "cotizacion-merylay.pdf" }], carrusel: null };
    }

    case "confirmar_pedido": {
      if (sessionData.cart.length === 0) {
        return { texto: "Tu carrito está vacío, agrega algún producto antes de confirmar un pedido.", documentos: [], carrusel: null };
      }
      const direccion = direccionEnvioSchema.safeParse(params);
      if (!direccion.success) {
        return {
          texto: "Para confirmar necesito tu nombre completo, teléfono, dirección y ciudad de envío.",
          documentos: [],
          carrusel: null,
        };
      }
      const { linkPago, orderNumber } = await crearPedidoWompiDesdeCarrito(profileId, sessionData.cart, direccion.data);
      sessionData.cart = [];
      // Determinista, no depende de que el modelo transcriba bien la
      // direccion: si confirmar_pedido ya se ejecuto con exito, estos
      // cuatro datos son reales y van directo a memoria.
      await guardarMemoria(profileId, [
        { categoria: "contacto", clave: "nombre_completo", valor: direccion.data.fullName },
        { categoria: "contacto", clave: "direccion_habitual", valor: direccion.data.address },
        { categoria: "contacto", clave: "ciudad_habitual", valor: direccion.data.city },
      ]);
      return {
        texto: `Tu pedido ${orderNumber} quedó listo. Paga aquí para confirmarlo: ${linkPago}`,
        documentos: [],
        carrusel: null,
      };
    }

    case "generar_acceso_web": {
      const { usuario, contrasena } = await generarAccesoWeb(profileId);
      return {
        texto: `Ya puedes entrar a merylayboutique.com con el usuario ${usuario} y la contraseña ${contrasena}. Te recomendamos cambiarla después de tu primer ingreso.`,
        documentos: [],
        carrusel: null,
      };
    }

    default:
      return { texto: mensajeDeRespaldo, documentos: [], carrusel: null };
  }
}

const MENSAJE_AUDIO_NO_ENTENDIDO = "No pude entender tu nota de voz, ¿puedes escribirla o intentarlo de nuevo?";
// Identifica el producto exacto cuando el mensaje trae el link que arma
// WhatsappProductButton ("Preguntar por WhatsApp" en una pagina de
// producto: ".../producto/<slug>"), sin importar el dominio.
const REGEX_SLUG_PRODUCTO = /\/producto\/([a-z0-9-]+)/i;

export async function procesarMensajeEntrante(payload: unknown): Promise<void> {
  const entrante = parsearMensajeEntrante(payload);
  if (!entrante) return;

  const telefono = normalizarTelefono(entrante.from);

  // Marca el mensaje como leido y activa el indicador de "escribiendo..." lo
  // antes posible -- antes de transcribir audio o de llamar a OpenAI, que es
  // justo la espera que el indicador debe cubrir. Es un efecto secundario de
  // UX, nunca debe bloquear ni tumbar la respuesta real si la Graph API falla.
  try {
    await marcarLeidoYEscribiendo(entrante.messageId);
  } catch (error) {
    console.error(`[handler] No se pudo activar el indicador de escribiendo para ${entrante.messageId}:`, error);
  }

  if (entrante.kind === "pedido_catalogo") {
    const resumenPedido = entrante.items.map((i) => `${i.retailerId}x${i.cantidad}`).join(", ");
    const esNuevo = await registrarMensaje(telefono, "inbound", `[pedido catalogo] ${resumenPedido}`, entrante.messageId);
    if (!esNuevo) return;

    let respuesta: string;
    try {
      const { profileId } = await buscarOCrearCliente(telefono);
      const { id: sessionId, sessionData } = await obtenerOCrearSesion(telefono, profileId);
      respuesta = await manejarPedidoCatalogo(entrante.items, sessionData);
      await guardarSesion(sessionId, sessionData);
    } catch (error) {
      console.error(`[handler] Error procesando el pedido de catalogo ${entrante.messageId} de ${telefono}:`, error);
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
  let resultado: RespuestaSaliente;
  try {
    resultado = await generarRespuesta(telefono, { messageId: entrante.messageId, texto });
  } catch (error) {
    console.error(`[handler] Error procesando el mensaje ${entrante.messageId} de ${telefono}:`, error);
    resultado = { texto: MENSAJE_ERROR_GENERICO, documentos: [], carrusel: null };
  }

  // El texto (saludo/respuesta de la asesora) se manda SIEMPRE primero,
  // y las tarjetas de producto/documentos despues -- asi la clienta recibe
  // contexto antes que un bombardeo de fotos sin explicacion.
  try {
    await enviarTexto(telefono, resultado.texto);
    if (resultado.carrusel) {
      // Envio propio con su propio try/catch: si la Graph API rechaza el
      // carrusel (ej. un producto no sincronizado con el catalogo de Meta,
      // o un campo invalido), la clienta ya recibio el saludo -- sin esto
      // se quedaba sin ver nada mas, con el error solo en el log del
      // servidor (bug real reportado: "me dijo que buscaba las camisetas
      // y no mostro nada").
      try {
        if (resultado.carrusel.tipo === "unico") {
          await enviarProductoUnico(telefono, { cuerpo: CUERPO_CARRUSEL, retailerId: resultado.carrusel.retailerId });
        } else {
          await enviarListaProductos(telefono, { cuerpo: CUERPO_CARRUSEL, encabezado: resultado.carrusel.encabezado, secciones: resultado.carrusel.secciones });
        }
      } catch (error) {
        console.error(`[handler] No se pudo mandar el carrusel de producto a ${telefono}:`, error);
        await enviarTexto(telefono, MENSAJE_CARRUSEL_FALLIDO);
      }
    }
    for (const documento of resultado.documentos) {
      await enviarDocumentoPorLink(telefono, documento.link, documento.filename);
    }
    await registrarMensaje(telefono, "outbound", resultado.texto);
  } catch (error) {
    console.error(`[handler] No se pudo enviar/registrar la respuesta a ${telefono}:`, error);
  }
}

const CUERPO_CARRUSEL = "Toca el que más te guste para ver los detalles y agregarlo a tu carrito 💕";
const MENSAJE_CARRUSEL_FALLIDO = "Tuve un problema para mostrarte las opciones, ¿puedes intentarlo de nuevo en un momento? 💕";

const MENSAJE_ERROR_GENERICO = "Disculpa, tuve un problema procesando tu mensaje. Intenta de nuevo en un momento.";

async function generarRespuesta(
  telefono: string,
  entrante: { messageId: string; texto: string },
): Promise<RespuestaSaliente> {
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
        const texto = await ejecutarAccionEscritura(action, params);
        return { texto, documentos: [], carrusel: null };
      } finally {
        sessionData.pendingConfirmation = null;
        await guardarSesion(sessionId, sessionData);
      }
    }
    sessionData.pendingConfirmation = null;
    await guardarSesion(sessionId, sessionData);
    return { texto: "Entendido, no hice ningún cambio. ¿En qué más te ayudo?", documentos: [], carrusel: null };
  }

  const historial = await cargarHistorial(telefono, entrante.messageId);
  const memoria = rol === "customer" ? await cargarMemoria(profileId) : [];
  const decision = await decidirAccion({
    rol,
    nombreDueno: nombreDueno ?? undefined,
    historial,
    mensajeEntrante: entrante.texto,
    memoriaCliente: memoria,
  });

  // Mejor-esfuerzo: la memoria nunca debe impedir que la clienta reciba
  // respuesta (guardarMemoria ya es fail-open internamente), asi que esto
  // va ANTES del switch de acciones, no envuelto en su propio try/catch.
  if (rol === "customer" && decision.memoria && decision.memoria.length > 0) {
    await guardarMemoria(profileId, decision.memoria);
  }

  // "chat" es una respuesta libre y "error" trae la disculpa que ya armo
  // decidirAccion: en ambos casos se usa response_message tal cual.
  if (decision.action === "chat" || decision.action === "error") {
    return { texto: decision.response_message, documentos: [], carrusel: null };
  }

  if (rol === "owner") {
    if (ACCIONES_ESCRITURA.has(decision.action)) {
      sessionData.pendingConfirmation = { action: decision.action, params: decision.params };
      await guardarSesion(sessionId, sessionData);
      return {
        texto: `¿Confirmas esta acción? ${decision.action} con ${JSON.stringify(decision.params)}. Responde "sí" para confirmar.`,
        documentos: [],
        carrusel: null,
      };
    }
    const resultadoLectura = await ejecutarAccionLectura(decision.action, decision.params);
    for (const foto of resultadoLectura.fotos) {
      await enviarImagenPorLink(telefono, foto.url, foto.caption);
    }
    for (const documento of resultadoLectura.documentos) {
      await enviarDocumentoPorLink(telefono, documento.link, documento.filename);
    }
    return { texto: resultadoLectura.texto, documentos: [], carrusel: null };
  }

  const slugProducto = REGEX_SLUG_PRODUCTO.exec(entrante.texto)?.[1] ?? null;
  const resultado = await ejecutarAccionCliente(decision.action, decision.params, profileId, sessionData, decision.response_message, slugProducto);
  await guardarSesion(sessionId, sessionData);
  return resultado;
}
