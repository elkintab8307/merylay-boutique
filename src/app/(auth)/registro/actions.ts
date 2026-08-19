"use server";

import { createElement } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

  const metadata = {
    full_name: parsed.data.fullName,
    address: parsed.data.address,
    whatsapp: parsed.data.whatsapp,
  };

  let hasSession: boolean;

  if (parsed.data.email) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { data: metadata },
    });

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        return { error: "Ya existe una cuenta con ese correo electrónico." };
      }
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }

    hasSession = Boolean(data.session);
  } else {
    // Sin email real: Supabase intentaria mandar un correo de confirmacion
    // a una direccion inventada y la cuenta quedaria atrapada "sin
    // confirmar" sin forma de completarla. Se crea ya confirmada con el
    // service role (mismo mecanismo que scripts/seed-superadmin.ts) y
    // luego se inicia sesion normalmente.
    const emailSintetico = `${parsed.data.whatsapp.replace(/\D/g, "")}@merylay.local`;
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.createUser({
      email: emailSintetico,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: metadata,
    });

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        return { error: "Ya existe una cuenta con ese WhatsApp." };
      }
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }

    const supabase = await createClient();
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: emailSintetico,
        password: parsed.data.password,
      });

    if (signInError) {
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }

    hasSession = Boolean(signInData.session);
  }

  // Mismo criterio que en checkout/webhook/admin: la cuenta YA quedo
  // creada, asi que ningun fallo del correo de bienvenida puede
  // convertirse en un "no pudimos crear tu cuenta" para quien si se
  // registro. Nunca se envia a la direccion @merylay.local sintetica.
  if (parsed.data.email) {
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
  }

  if (hasSession) {
    return { success: true };
  }

  return {
    message:
      "Registro exitoso. Revisa tu correo electrónico para confirmar tu cuenta.",
  };
}
