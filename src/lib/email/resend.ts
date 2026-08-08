import { Resend } from "resend";
import type { ReactElement } from "react";

const REMITENTE = "MeryLay Boutique <pedidos@merylays.shop>";

export async function enviarCorreo(params: {
  to: string;
  subject: string;
  react: ReactElement;
}): Promise<{ error: string } | { id: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email] RESEND_API_KEY no esta configurado — correo no enviado.");
    return { error: "RESEND_API_KEY no configurado." };
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: REMITENTE,
      to: params.to,
      subject: params.subject,
      react: params.react,
    });

    if (error) {
      console.error(
        `[email] Resend rechazo el envio a ${params.to} ("${params.subject}"):`,
        error,
      );
      return { error: error.message };
    }

    return { id: data?.id ?? "" };
  } catch (error) {
    console.error(
      `[email] Error inesperado enviando a ${params.to} ("${params.subject}"):`,
      error,
    );
    return { error: "Error inesperado al enviar el correo." };
  }
}
