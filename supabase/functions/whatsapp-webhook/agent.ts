import type { AgentDecision, RolRemitente } from "../_shared/types.ts";

// Cada accion con las claves EXACTAS de "params" que lee handler.ts
// (ejecutarAccionCliente / ejecutarAccionLectura / ejecutarAccionEscritura).
// Si se agrega o renombra un parametro alla, hay que actualizarlo aqui:
// el modelo no tiene otra forma de saber como se llaman.
const ACCIONES_CLIENTE = `
- buscar_producto: params {"consulta": string, "talla": string | null, "color": string | null} — "consulta" es texto libre (nombre o categoria, ej. "pijama" o "camisetas"); "talla"/"color" son opcionales. El sistema manda hasta 10 tarjetas con foto, precio, stock y un boton de "Agregar al carrito" por cada coincidencia — nunca describas tu ni inventes la lista en response_message, solo confirma que las vas a mandar o pide mas detalle si "consulta" quedo vacio.
- agregar_al_carrito: params {"productId": string uuid, "variantId": string uuid | null, "qty": entero >= 1} — productId y variantId deben venir del boton "Agregar al carrito" que el cliente toco en una tarjeta de buscar_producto; NUNCA los inventes ni los deduzcas del nombre del producto. Si el producto tiene variantes, variantId es obligatorio (la de la talla/color que eligio el cliente). Si el cliente describe el producto en texto (ej. "agrégame la primera" o "quiero la pijama rosa") en vez de tocar un boton, y no tienes un productId/variantId real para ese producto, responde con "chat" pidiendole que toque el boton de "Agregar al carrito" en la tarjeta del producto, o que lo describa de nuevo para volver a mostrarselo con su boton.
- quitar_del_carrito: params {"productId": string uuid, "variantId": string uuid | null (opcional)} — mismos ids con los que se agrego al carrito.
- generar_catalogo_pdf: params {"texto": string | null, "talla": string | null, "color": string | null} — envia el catalogo en PDF con fotos; sin ningun parametro, manda el catalogo completo. Usala cuando el cliente pida "el catalogo"/"todo lo que tengan" de una categoria o en general.
- generar_cotizacion_pdf: params {} — envia una cotizacion en PDF con lo que hay en el carrito.
- confirmar_pedido: params {"fullName": string, "phone": string, "address": string, "city": string} — datos de envio; los cuatro son obligatorios. Si falta alguno, pidelo con "chat" en lugar de inventarlo.
- generar_acceso_web: params {} — cuando el cliente quiere entrar a la pagina web a ver sus pedidos.
- chat: params {} — respuesta libre en response_message (saludos, preguntas generales, pedir datos que faltan).`;

const ACCIONES_DUENO = `
Lectura (se ejecutan de inmediato):
- consultar_ventas: params {"dias": entero >= 1} — ventas pagadas de los ultimos N dias (tienda/WhatsApp + POS). "hoy" = 1.
- consultar_stock_bajo: params {"umbral": entero >= 0} — productos activos con stock menor al umbral (por defecto 5).
- buscar_cliente: params {"consulta": string} — nombre o telefono del cliente.
- consultar_pedido: params {"numeroOId": string} — numero de pedido (ej. "ML-20261006-abc123") o su id uuid.
- buscar_inventario: params {"texto": string | null, "talla": string | null, "color": string | null, "conFotos": boolean} — al menos uno de texto/talla/color es obligatorio. Usala para "cuantos/cuantas tenemos de X", "que stock hay de X/en talla Y", o para pedir ver productos de una categoria. "conFotos" es true SOLO si el dueño pidio ver/mostrar imagenes explicitamente (ej. "muestrame las camisetas", "mandame fotos de las pijamas"); para una pregunta de cantidad/stock (ej. "cuantas camisetas hay", "que stock queda de X") usa conFotos false y responde solo con el conteo y el stock total, sin fotos.
- generar_informe_pdf: params {"texto": string | null, "talla": string | null, "color": string | null} — mismos filtros que buscar_inventario, pero manda TODAS las coincidencias en un PDF con fotos (no solo 10). Usala cuando el dueño pida "el informe"/"todas las fotos"/"mandamelo en pdf".
Escritura (se le pide confirmacion al dueño antes de ejecutarlas):
- actualizar_precio_producto: params {"idOSku": string, "nuevoPrecio": number} — idOSku es el SKU o el id uuid del producto; nuevoPrecio en pesos colombianos, sin puntos ni signos.
- actualizar_stock: params {"idOSku": string, "nuevoStock": entero >= 0}.
- cambiar_estado_pedido: params {"numeroPedido": string, "nuevoEstado": "pendiente" | "pagado" | "enviado" | "entregado" | "cancelado"} — numeroPedido es el numero de pedido (ej. "ML-20261006-abc123").
- activar_o_desactivar_producto: params {"idOSku": string, "activo": boolean}.
- chat: params {} — respuesta libre en response_message.`;

const FORMATO_RESPUESTA =
  `Responde SIEMPRE con un JSON {"action": string, "params": object, "response_message": string}. ` +
  `"params" debe usar EXACTAMENTE las claves documentadas para esa accion (mismos nombres, mismos tipos). ` +
  `Usa "chat" solo si ninguna otra accion aplica o si te falta un dato obligatorio para otra accion.`;

function promptSistema(rol: RolRemitente, nombreDueno?: "Elkin" | "Mary"): string {
  if (rol === "owner") {
    return `Eres el asistente interno de MeryLay Boutique, hablando con ${nombreDueno}, dueño del negocio. ` +
      `Tiene acceso total de lectura y escritura sobre el negocio. ` +
      `Responde de forma cordial y natural, como lo haria una persona del equipo: cuando ${nombreDueno} te pida algo que puedas hacer, ejecutalo de verdad (nunca digas que lo harias sin hacerlo) y confirma el resultado con datos reales, no con una respuesta generica. ` +
      `${FORMATO_RESPUESTA}\n` +
      `Acciones disponibles y sus params:${ACCIONES_DUENO}`;
  }
  return `Eres el asistente de ventas de MeryLay Boutique ("Inspiracion Femenina"), atendiendo a un cliente por WhatsApp. ` +
    `${FORMATO_RESPUESTA}\n` +
    `Acciones disponibles y sus params:${ACCIONES_CLIENTE}\n` +
    `Los precios, nombres y stock los obtiene el sistema de la base de datos: nunca los incluyas en params. ` +
    `Saluda con cordialidad en el primer mensaje de la conversación y pregunta qué necesita el cliente antes de asumir una acción. Mantén un tono cálido, acorde a "Inspiración Femenina".`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Marca un error de OpenAI como no transitorio (ej. 401 por API key invalida):
// reintentar no cambiaria el resultado, asi que debe escapar el bucle de
// reintentos de inmediato en lugar de agotar los 3 intentos con backoff.
class ErrorNoReintentable extends Error {}

async function llamarOpenAI(mensajes: { role: string; content: string }[]): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    throw new Error("Falta OPENAI_API_KEY.");
  }

  const maxIntentos = 3;
  let ultimoError: unknown;

  for (let intento = 0; intento < maxIntentos; intento++) {
    try {
      const respuesta = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: mensajes,
        }),
      });

      if (respuesta.ok) {
        const cuerpo = await respuesta.json();
        return cuerpo.choices[0].message.content as string;
      }

      if (![429, 500, 503].includes(respuesta.status)) {
        throw new ErrorNoReintentable(`OpenAI respondio ${respuesta.status}`);
      }
      ultimoError = new Error(`OpenAI respondio ${respuesta.status}`);
    } catch (e) {
      if (e instanceof ErrorNoReintentable) {
        throw e;
      }
      ultimoError = e;
    }
    // Solo se espera ENTRE intentos: tras el ultimo fallo no hay nada que
    // reintentar, esperar solo retrasaria la respuesta de error al usuario.
    if (intento < maxIntentos - 1) {
      await esperar(500 * 2 ** intento);
    }
  }

  throw ultimoError;
}

export async function decidirAccion(opts: {
  rol: RolRemitente;
  nombreDueno?: "Elkin" | "Mary";
  historial: { direction: "inbound" | "outbound"; message_body: string }[];
  mensajeEntrante: string;
}): Promise<AgentDecision> {
  const mensajes = [
    { role: "system", content: promptSistema(opts.rol, opts.nombreDueno) },
    ...opts.historial.map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      content: m.message_body,
    })),
    { role: "user", content: opts.mensajeEntrante },
  ];

  try {
    const contenido = await llamarOpenAI(mensajes);
    const decision = JSON.parse(contenido) as AgentDecision;
    if (typeof decision.action !== "string" || typeof decision.response_message !== "string") {
      throw new Error("Respuesta de OpenAI sin el formato esperado.");
    }
    return { action: decision.action, params: decision.params ?? {}, response_message: decision.response_message };
  } catch (error) {
    console.error("[agent] Error llamando a OpenAI o parseando su respuesta:", error);
    return {
      action: "error",
      params: {},
      response_message: "Disculpa, tuve un problema para procesar tu mensaje. ¿Puedes intentarlo de nuevo en un momento?",
    };
  }
}
