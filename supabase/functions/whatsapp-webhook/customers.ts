import { getSupabase } from "../_shared/db.ts";

export function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

export async function buscarOCrearCliente(
  telefono: string,
): Promise<{ profileId: string; esNuevo: boolean }> {
  const digitos = normalizarTelefono(telefono);
  const supabase = getSupabase();

  const { data: profileId } = await supabase.rpc("buscar_profile_por_telefono", {
    p_telefono: digitos,
  });

  if (profileId) {
    return { profileId: profileId as string, esNuevo: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: `${digitos}@merylay.local`,
    email_confirm: true,
    user_metadata: { whatsapp: digitos },
  });

  if (error || !data.user) {
    throw new Error(`No se pudo crear el cliente de WhatsApp ${digitos}: ${error?.message}`);
  }

  return { profileId: data.user.id, esNuevo: true };
}

function generarContrasenaAleatoria(): string {
  const caracteres = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let contrasena = "";
  for (let i = 0; i < 10; i++) {
    contrasena += caracteres[Math.floor(Math.random() * caracteres.length)];
  }
  return contrasena;
}

export async function generarAccesoWeb(
  profileId: string,
): Promise<{ usuario: string; contrasena: string }> {
  const supabase = getSupabase();
  const contrasena = generarContrasenaAleatoria();

  const { data: userData } = await supabase.auth.admin.getUserById(profileId);
  const email = userData.user?.email ?? "";
  const usuario = email.split("@")[0];

  await supabase.auth.admin.updateUserById(profileId, { password: contrasena });

  return { usuario, contrasena };
}
