"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function actualizarCliente(
  id: string,
  datos: { nombre: string; telefono: string; cedula: string; direccion: string },
): Promise<{ error?: string }> {
  const nombre = datos.nombre.trim();
  if (nombre.length < 2) {
    return { error: "Ingresa el nombre del cliente." };
  }

  const telefonoNormalizado = datos.telefono.replace(/\D/g, "");
  if (telefonoNormalizado.length < 7) {
    return { error: "Ingresa un teléfono válido." };
  }

  const adminClient = createAdminClient();
  const { data: perfiles } = await adminClient
    .from("profiles")
    .select("id")
    .eq("whatsapp", telefonoNormalizado)
    .order("created_at", { ascending: false })
    .limit(1);

  const supabase = await createClient();
  const { error } = await supabase
    .from("pos_customers")
    .update({
      nombre,
      telefono: telefonoNormalizado,
      cedula: datos.cedula.trim() || null,
      direccion: datos.direccion.trim() || null,
      profile_id: perfiles?.[0]?.id ?? null,
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe otro cliente con ese teléfono." };
    }
    return { error: "No se pudo actualizar el cliente." };
  }

  revalidatePath(`/pos/clientes/${id}`);
  return {};
}
