"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveEmail } from "@/lib/auth/resolve-email";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";

export async function login(
  input: LoginInput,
  redirectTo: string,
): Promise<{ error: string } | undefined> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const email = await resolveEmail(parsed.data.identifier);
  if (!email) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  redirect(redirectTo || "/");
}
