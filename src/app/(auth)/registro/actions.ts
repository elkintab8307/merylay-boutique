"use server";

import { createElement } from "react";
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

  // Mismo criterio que en checkout/webhook/admin: la cuenta YA quedo creada,
  // asi que ningun fallo del correo de bienvenida puede convertirse en un
  // "no pudimos crear tu cuenta" para quien si se registro. La plantilla se
  // pasa con `createElement` (no invocada como funcion) para que su cuerpo se
  // ejecute dentro del render de Resend y no aqui, de forma ansiosa.
  try {
    await enviarCorreo({
      to: parsed.data.email,
      subject: "Bienvenida a MeryLay Boutique",
      react: createElement(BienvenidaEmail, { nombre: parsed.data.fullName }),
    });
  } catch (emailError) {
    console.error(
      "[email] Error preparando o enviando el correo de bienvenida:",
      emailError,
    );
  }

  if (data.session) {
    return { success: true };
  }

  return {
    message:
      "Registro exitoso. Revisa tu correo electrónico para confirmar tu cuenta.",
  };
}
