"use server";

import { createClient } from "@/lib/supabase/server";

export type PosCustomerResult = {
  id: string;
  nombre: string;
  telefono: string;
};

function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

export async function buscarClientes(query: string): Promise<PosCustomerResult[]> {
  const trimmed = query.trim().replace(/[%,()]/g, "");
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data } = await supabase
    .from("pos_customers")
    .select("id, nombre, telefono")
    .or(`nombre.ilike.%${trimmed}%,telefono.ilike.%${trimmed}%`)
    .limit(10);

  return data ?? [];
}

export async function crearCliente(
  nombre: string,
  telefono: string,
): Promise<{ cliente?: PosCustomerResult; error?: string }> {
  const nombreLimpio = nombre.trim();
  if (nombreLimpio.length < 2) {
    return { error: "Ingresa el nombre del cliente." };
  }

  const telefonoNormalizado = normalizarTelefono(telefono);
  if (telefonoNormalizado.length < 7) {
    return { error: "Ingresa un teléfono válido." };
  }

  const supabase = await createClient();
  const { data: profileId } = await supabase.rpc("buscar_profile_por_telefono", {
    p_telefono: telefonoNormalizado,
  });

  const { data, error } = await supabase
    .from("pos_customers")
    .insert({
      nombre: nombreLimpio,
      telefono: telefonoNormalizado,
      profile_id: profileId ?? null,
    })
    .select("id, nombre, telefono")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { error: "Ya existe un cliente con ese teléfono. Búscalo en vez de crearlo de nuevo." };
    }
    return { error: "No se pudo crear el cliente." };
  }

  return { cliente: data };
}
