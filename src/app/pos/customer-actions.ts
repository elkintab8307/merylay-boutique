"use server";

import { createClient } from "@/lib/supabase/server";
import { sanitizarQueryBusqueda } from "@/lib/search/sanitize";

export type PosCustomerResult = {
  id: string;
  nombre: string;
  telefono: string;
};

export type PosCustomerSearchResult = PosCustomerResult & {
  origen: "pos" | "portal";
  profileId: string | null;
};

function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

export async function buscarClientes(query: string): Promise<PosCustomerSearchResult[]> {
  const trimmed = sanitizarQueryBusqueda(query);
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data } = await supabase.rpc("listar_clientes_pos", {
    p_query: trimmed,
    p_limit: 10,
  });

  return (data ?? []).map((fila) => ({
    id: fila.id,
    nombre: fila.nombre,
    telefono: fila.telefono,
    origen: fila.origen as "pos" | "portal",
    profileId: fila.profile_id,
  }));
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

export async function vincularClientePortal(
  profileId: string,
): Promise<{ cliente?: PosCustomerResult; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vincular_cliente_portal", {
    p_profile_id: profileId,
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo vincular el cliente." };
  }

  return { cliente: { id: data.id, nombre: data.nombre, telefono: data.telefono } };
}
