"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperadmin } from "@/lib/admin/require-superadmin";
import { puedeBloquear, puedeCambiarRol } from "@/lib/admin/user-guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const rolAsignableSchema = z.enum(["customer", "staff", "admin"]);

export async function cambiarRol(
  userId: string,
  nuevoRol: string,
): Promise<{ error?: string }> {
  const actor = await requireSuperadmin();

  const parsed = rolAsignableSchema.safeParse(nuevoRol);
  if (!parsed.success) {
    return { error: "Rol inválido." };
  }

  if (!puedeCambiarRol(actor.id, userId)) {
    return { error: "No puedes cambiar tu propio rol." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: parsed.data })
    .eq("id", userId);

  if (error) {
    return { error: "No se pudo cambiar el rol." };
  }

  revalidatePath("/superadmin/usuarios");
  return {};
}

export async function bloquearUsuario(
  userId: string,
): Promise<{ error?: string }> {
  const actor = await requireSuperadmin();

  if (!puedeBloquear(actor.id, userId)) {
    return { error: "No puedes bloquearte a ti mismo." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
  });

  if (error) {
    return { error: "No se pudo bloquear al usuario." };
  }

  revalidatePath("/superadmin/usuarios");
  return {};
}

export async function reactivarUsuario(
  userId: string,
): Promise<{ error?: string }> {
  await requireSuperadmin();

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: "none",
  });

  if (error) {
    return { error: "No se pudo reactivar al usuario." };
  }

  revalidatePath("/superadmin/usuarios");
  return {};
}
