// Confirma por WhatsApp el pago de un pedido creado desde el bot de WhatsApp.
// Estos pedidos pertenecen a un perfil con un correo sintetico
// (<telefono>@merylay.local, ver supabase/functions/whatsapp-webhook/customers.ts)
// que la clienta nunca lee, asi que notificarla por correo (como hace el
// checkout web) no llegaria a nadie. Se le avisa por el mismo canal donde
// hizo la compra, delegando el envio real a la Edge Function
// confirmar-pago-whatsapp (misma arquitectura que notificar-pedido): ahi
// viven las credenciales de la API de WhatsApp, nunca en Vercel.
//
// Fail-open igual que enviarCorreo (src/lib/email/resend.ts): el pago YA
// quedo confirmado en la base de datos cuando esto se llama, asi que un
// aviso que no sale nunca debe quedar en un log, no tumbar el webhook de Wompi.
export async function enviarConfirmacionPagoWhatsapp(params: {
  orderId: string;
}): Promise<{ error: string } | { ok: true }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secreto = process.env.CONFIRMAR_PAGO_WHATSAPP_SECRET;

  if (!supabaseUrl || !secreto) {
    console.error(
      "[whatsapp] Faltan NEXT_PUBLIC_SUPABASE_URL o CONFIRMAR_PAGO_WHATSAPP_SECRET — confirmacion de pago por WhatsApp no enviada.",
    );
    return { error: "Configuracion de WhatsApp incompleta." };
  }

  try {
    const respuesta = await fetch(`${supabaseUrl}/functions/v1/confirmar-pago-whatsapp`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-confirmar-pago-whatsapp-secret": secreto,
      },
      body: JSON.stringify({ orderId: params.orderId }),
    });

    if (!respuesta.ok) {
      const cuerpo = await respuesta.text();
      console.error(
        `[whatsapp] confirmar-pago-whatsapp respondio ${respuesta.status} para el pedido ${params.orderId}:`,
        cuerpo,
      );
      return { error: `confirmar-pago-whatsapp respondio ${respuesta.status}.` };
    }

    return { ok: true };
  } catch (error) {
    console.error(
      `[whatsapp] Error inesperado enviando la confirmacion de pago por WhatsApp del pedido ${params.orderId}:`,
      error,
    );
    return { error: "Error inesperado al enviar la confirmacion por WhatsApp." };
  }
}
