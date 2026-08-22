"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";

const STAFF_ROLES = ["staff", "admin", "superadmin"];

export async function actualizarCliente(
  id: string,
  datos: { nombre: string; telefono: string; cedula: string; direccion: string },
): Promise<{ error?: string }> {
  const currentUser = await getCurrentProfile();
  if (!currentUser || !STAFF_ROLES.includes(currentUser.profile.role)) {
    return { error: "No autorizado." };
  }

  const nombre = datos.nombre.trim();
  if (nombre.length < 2) {
    return { error: "Ingresa el nombre del cliente." };
  }

  const telefonoNormalizado = datos.telefono.replace(/\D/g, "");
  if (telefonoNormalizado.length < 7) {
    return { error: "Ingresa un teléfono válido." };
  }

  const supabase = await createClient();

  const { data: clienteActual } = await supabase
    .from("pos_customers")
    .select("telefono, profile_id")
    .eq("id", id)
    .single();

  let profileId = clienteActual?.profile_id ?? null;
  if (clienteActual && clienteActual.telefono !== telefonoNormalizado) {
    const { data: profileIdEncontrado } = await supabase.rpc("buscar_profile_por_telefono", {
      p_telefono: telefonoNormalizado,
    });
    profileId = profileIdEncontrado ?? null;
  }

  const { data: actualizado, error } = await supabase
    .from("pos_customers")
    .update({
      nombre,
      telefono: telefonoNormalizado,
      cedula: datos.cedula.trim() || null,
      direccion: datos.direccion.trim() || null,
      profile_id: profileId,
    })
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe otro cliente con ese teléfono." };
    }
    return { error: "No se pudo actualizar el cliente." };
  }

  if (!actualizado) {
    return { error: "No se pudo actualizar el cliente (no encontrado o sin permisos)." };
  }

  revalidatePath(`/pos/clientes/${id}`);
  return {};
}
