"use server";

import { isEmail, normalizeUsername } from "./identifier";
import { createAdminClient } from "@/lib/supabase/admin";

export async function resolveEmail(identifier: string): Promise<string | null> {
  const trimmed = identifier.trim();
  if (isEmail(trimmed)) {
    return trimmed;
  }

  const admin = createAdminClient();

  // normalizeUsername() quita caracteres antes de pasar a minusculas (a
  // proposito, para calzar con handle_new_user()), asi que un identificador
  // con una mayuscula suelta -- comun en moviles, que capitalizan la
  // primera letra del campo -- no matchea el username guardado. Se
  // intenta primero tal cual (compatible con los usernames "raros" que ya
  // genero el trigger) y, si no hay match, con el texto ya en minusculas.
  const candidatos = [
    ...new Set([normalizeUsername(trimmed), normalizeUsername(trimmed.toLowerCase())]),
  ];

  let profileId: string | null = null;
  for (const candidato of candidatos) {
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("username", candidato)
      .maybeSingle();
    if (data) {
      profileId = data.id;
      break;
    }
  }

  if (!profileId) {
    return null;
  }

  const { data: userData, error } = await admin.auth.admin.getUserById(
    profileId,
  );

  if (error || !userData.user?.email) {
    return null;
  }

  return userData.user.email;
}
