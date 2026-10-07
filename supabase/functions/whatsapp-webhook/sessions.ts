import { getSupabase } from "../_shared/db.ts";
import { sessionVacia, type SessionData } from "../_shared/types.ts";

export async function obtenerOCrearSesion(
  telefono: string,
  profileId: string,
): Promise<{ id: string; sessionData: SessionData }> {
  const supabase = getSupabase();

  const { data: existente } = await supabase
    .from("whatsapp_sessions")
    .select("id, session_data")
    .eq("phone_number", telefono)
    .maybeSingle();

  if (existente) {
    return { id: existente.id as string, sessionData: existente.session_data as SessionData };
  }

  const { data: creada, error } = await supabase
    .from("whatsapp_sessions")
    .insert({ phone_number: telefono, customer_id: profileId, session_data: sessionVacia() })
    .select("id, session_data")
    .single();

  if (error || !creada) {
    throw new Error(`No se pudo crear la sesion de WhatsApp para ${telefono}: ${error?.message}`);
  }

  return { id: creada.id as string, sessionData: creada.session_data as SessionData };
}

export interface MensajeHistorial {
  direction: "inbound" | "outbound";
  message_body: string;
}

const LIMITE_HISTORIAL = 10;

// Ultimos mensajes de la conversacion con ese telefono, del mas viejo al
// mas nuevo (el orden que espera decidirAccion). Se piden los mas
// recientes (desc + limit) y luego se invierten. El mensaje entrante que
// se esta procesando ya quedo registrado en whatsapp_messages por el
// chequeo de idempotencia, asi que se excluye por su provider_message_id
// (se pide una fila de mas para compensarlo) — si no, el modelo lo
// veria dos veces. Es contexto opcional: si la consulta falla, se sigue
// sin historial en vez de dejar al usuario sin respuesta.
export async function cargarHistorial(
  telefono: string,
  excluirProviderMessageId?: string,
): Promise<MensajeHistorial[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("whatsapp_messages")
    .select("direction, message_body, provider_message_id")
    .eq("phone_number", telefono)
    .order("created_at", { ascending: false })
    .limit(LIMITE_HISTORIAL + 1);

  if (error || !data) {
    console.error(`[sessions] No se pudo cargar el historial de ${telefono}:`, error);
    return [];
  }

  return (data as { direction: "inbound" | "outbound"; message_body: string | null; provider_message_id: string | null }[])
    .filter((m) => !excluirProviderMessageId || m.provider_message_id !== excluirProviderMessageId)
    .slice(0, LIMITE_HISTORIAL)
    .filter((m): m is typeof m & { message_body: string } => typeof m.message_body === "string" && m.message_body.length > 0)
    .map((m) => ({ direction: m.direction, message_body: m.message_body }))
    .reverse();
}

export async function guardarSesion(id: string, sessionData: SessionData): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("whatsapp_sessions")
    .update({ session_data: sessionData, last_interaction: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`No se pudo guardar la sesion ${id}: ${error.message}`);
  }
}
