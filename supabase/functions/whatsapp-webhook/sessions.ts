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
