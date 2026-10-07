import { getSupabase } from "../_shared/db.ts";
import { enviarTexto } from "../_shared/meta.ts";
import { parsearMensajeEntrante } from "./adapters.ts";
import { buscarOCrearCliente, normalizarTelefono } from "./customers.ts";
import { obtenerOCrearSesion, guardarSesion } from "./sessions.ts";
import { decidirAccion } from "./agent.ts";
import * as ownerActions from "./owner-actions.ts";
import { ACCIONES_ESCRITURA } from "./owner-actions.ts";

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

async function ejecutarAccionLectura(accion: string, params: Record<string, unknown>): Promise<string> {
  switch (accion) {
    case "consultar_ventas":
      return ownerActions.consultarVentas((params.dias as number) ?? 1);
    case "consultar_stock_bajo":
      return ownerActions.consultarStockBajo((params.umbral as number) ?? 5);
    case "buscar_cliente":
      return ownerActions.buscarCliente(params.consulta as string);
    case "consultar_pedido":
      return ownerActions.consultarPedido(params.numeroOId as string);
    case "consultar_producto":
      return ownerActions.consultarProducto(params.consulta as string);
    default:
      return "No reconozco esa consulta todavia.";
  }
}

export async function procesarMensajeEntrante(payload: unknown): Promise<void> {
  const entrante = parsearMensajeEntrante(payload);
  if (!entrante) return;

  const telefono = normalizarTelefono(entrante.from);
  const esNuevo = await registrarMensaje(telefono, "inbound", entrante.texto, entrante.messageId);
  if (!esNuevo) return; // ya procesado antes (reintento de Meta)

  const nombreDueno = esDueno(telefono);
  const rol = nombreDueno ? "owner" : "customer";

  const { profileId } = await buscarOCrearCliente(telefono);
  const { id: sessionId, sessionData } = await obtenerOCrearSesion(telefono, profileId);

  let respuesta: string;

  if (sessionData.pendingConfirmation) {
    if (esConfirmacionAfirmativa(entrante.texto)) {
      const { action, params } = sessionData.pendingConfirmation;
      respuesta = await ejecutarAccionEscritura(action, params);
      sessionData.pendingConfirmation = null;
      await guardarSesion(sessionId, sessionData);
    } else {
      sessionData.pendingConfirmation = null;
      await guardarSesion(sessionId, sessionData);
      respuesta = "Entendido, no hice ningún cambio. ¿En qué más te ayudo?";
    }
  } else {
    const decision = await decidirAccion({
      rol,
      nombreDueno: nombreDueno ?? undefined,
      historial: [],
      mensajeEntrante: entrante.texto,
    });

    if (rol === "owner" && ACCIONES_ESCRITURA.has(decision.action)) {
      sessionData.pendingConfirmation = { action: decision.action, params: decision.params };
      await guardarSesion(sessionId, sessionData);
      respuesta = `¿Confirmas esta acción? ${decision.action} con ${JSON.stringify(decision.params)}. Responde "sí" para confirmar.`;
    } else if (rol === "owner") {
      respuesta = decision.action === "chat" ? decision.response_message : await ejecutarAccionLectura(decision.action, decision.params);
    } else {
      respuesta = decision.response_message;
    }
  }

  await enviarTexto(telefono, respuesta);
  await registrarMensaje(telefono, "outbound", respuesta);
}
