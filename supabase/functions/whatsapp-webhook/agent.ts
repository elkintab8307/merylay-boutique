import type { AgentDecision, RolRemitente } from "../_shared/types.ts";

const ACCIONES_CLIENTE = [
  "buscar_producto", "agregar_al_carrito", "quitar_del_carrito",
  "generar_catalogo_pdf", "generar_cotizacion_pdf", "confirmar_pedido",
  "generar_acceso_web", "chat",
].join(", ");

const ACCIONES_DUENO = [
  "consultar_ventas", "consultar_stock_bajo", "buscar_cliente", "consultar_pedido",
  "consultar_producto", "actualizar_precio_producto", "actualizar_stock",
  "cambiar_estado_pedido", "activar_o_desactivar_producto", "chat",
].join(", ");

function promptSistema(rol: RolRemitente, nombreDueno?: "Elkin" | "Mary"): string {
  if (rol === "owner") {
    return `Eres el asistente interno de MeryLay Boutique, hablando con ${nombreDueno}, dueño del negocio. ` +
      `Tiene acceso total de lectura y escritura sobre el negocio. ` +
      `Responde SIEMPRE con un JSON {"action": string, "params": object, "response_message": string}. ` +
      `"action" debe ser una de: ${ACCIONES_DUENO}. Usa "chat" solo si ninguna otra aplica.`;
  }
  return `Eres el asistente de ventas de MeryLay Boutique ("Inspiracion Femenina"), atendiendo a un cliente por WhatsApp. ` +
    `Responde SIEMPRE con un JSON {"action": string, "params": object, "response_message": string}. ` +
    `"action" debe ser una de: ${ACCIONES_CLIENTE}. Usa "chat" solo si ninguna otra aplica.`;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
        throw new Error(`OpenAI respondio ${respuesta.status}`);
      }
      ultimoError = new Error(`OpenAI respondio ${respuesta.status}`);
    } catch (e) {
      ultimoError = e;
    }
    await esperar(500 * 2 ** intento);
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
