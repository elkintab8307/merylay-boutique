"use server";

import { createClient } from "@/lib/supabase/server";
import { registroSchema, type RegistroInput } from "@/lib/validation/auth";
import { enviarCorreo } from "@/lib/email/resend";
import { BienvenidaEmail } from "@/lib/email/templates/bienvenida-email";

export async function registro(
  input: RegistroInput,
): Promise<{ error?: string; message?: string; success?: boolean }> {
  const parsed = registroSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "Ya existe una cuenta con ese correo electrónico." };
    }
    return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
  }

  await enviarCorreo({
    to: parsed.data.email,
    subject: "Bienvenida a MeryLay Boutique",
    react: BienvenidaEmail({ nombre: parsed.data.fullName }),
  });

  if (data.session) {
    return { success: true };
  }

  return {
    message:
      "Registro exitoso. Revisa tu correo electrónico para confirmar tu cuenta.",
  };
}
