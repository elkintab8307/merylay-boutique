"use server";

import { createClient } from "@/lib/supabase/server";
import { resolveEmail } from "@/lib/auth/resolve-email";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { destinoPorRol } from "@/lib/auth/destino-por-rol";

export async function login(
  input: LoginInput,
): Promise<{ error: string } | { success: true; destinoPorDefecto: string }> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const email = await resolveEmail(parsed.data.identifier);
  if (!email) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  return { success: true, destinoPorDefecto: destinoPorRol(profile?.role) };
}
