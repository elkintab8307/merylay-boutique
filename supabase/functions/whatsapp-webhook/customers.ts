import { getSupabase } from "../_shared/db.ts";

export function normalizarTelefono(telefono: string): string {
  return telefono.replace(/\D/g, "");
}

async function buscarProfileIdPorTelefono(
  supabase: ReturnType<typeof getSupabase>,
  digitos: string,
): Promise<string | null> {
  const { data } = await supabase.rpc("buscar_profile_por_telefono", { p_telefono: digitos });
  return (data as string | null) ?? null;
}

export async function buscarOCrearCliente(
  telefono: string,
): Promise<{ profileId: string; esNuevo: boolean }> {
  const digitos = normalizarTelefono(telefono);
  const supabase = getSupabase();

  const profileId = await buscarProfileIdPorTelefono(supabase, digitos);
  if (profileId) {
    return { profileId, esNuevo: false };
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: `${digitos}@merylay.local`,
    email_confirm: true,
    user_metadata: { whatsapp: digitos },
  });

  if (error || !data.user) {
    // Carrera: dos mensajes casi simultaneos del mismo numero nuevo pueden
    // ver los dos "no existe ningun perfil" y los dos intentar crearlo -- el
    // primero gana, el segundo choca con el email sintetico que el primero
    // ya creo. Si para cuando llegamos aqui el perfil ya existe (lo creo la
    // otra solicitud), se reusa en vez de fallarle la respuesta a la clienta.
    const profileIdTrasCarrera = await buscarProfileIdPorTelefono(supabase, digitos);
    if (profileIdTrasCarrera) {
      return { profileId: profileIdTrasCarrera, esNuevo: false };
    }
    throw new Error(`No se pudo crear el cliente de WhatsApp ${digitos}: ${error?.message}`);
  }

  return { profileId: data.user.id, esNuevo: true };
}

function generarContrasenaAleatoria(): string {
  const caracteres = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let contrasena = "";
  for (let i = 0; i < bytes.length; i++) {
    contrasena += caracteres[bytes[i] % caracteres.length];
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
