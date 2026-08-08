"use server";

import { createElement } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { enviarCorreo } from "@/lib/email/resend";
import { ConfirmacionPedidoEmail } from "@/lib/email/templates/confirmacion-pedido-email";

export async function confirmarPedido(input: CheckoutInput): Promise<{ error?: string }> {
  const parsed = checkoutSchema.safeParse(input);
  // "wompi" es un metodo valido del esquema, pero NO de esta accion: aqui se
  // llama `create_order`, que descuenta stock de inmediato. Un pedido Wompi
  // solo puede crearse con `iniciarPagoWompi` (RPC `create_order_wompi`, sin
  // descontar stock); el stock se descuenta despues, al confirmar el pago
  // desde el webhook. Sin este guard, alguien que invoque esta Server Action
  // directamente con paymentMethod="wompi" dejaria un pedido con
  // payment_method='wompi' y status='pendiente' — justo la forma que busca el
  // webhook — pero con el stock ya descontado; un evento APPROVED posterior
  // volveria a descontarlo (doble descuento).
  if (!parsed.success || parsed.data.paymentMethod === "wompi") {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_shipping_address: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      address: parsed.data.address,
      city: parsed.data.city,
      notes: parsed.data.notes || null,
    },
    p_payment_method: parsed.data.paymentMethod,
  });

  if (error || !data) {
    return { error: error?.message ?? "No se pudo completar el pedido." };
  }

  // Todo el bloque del correo va dentro de un try/catch: llegado este punto la
  // RPC ya descontó stock, creó el pedido y vació el carrito. Si algo aquí
  // lanzara (supabase-js puede lanzar ante fallos inesperados, no solo devolver
  // `{error}`), nunca se ejecutaria el `redirect` de abajo y el cliente veria
  // una pantalla de error por un pedido que en realidad SI se creo; al
  // reintentar se encontraria con "Tu carrito esta vacio.". `enviarCorreo` ya
  // es a prueba de fallos por dentro, pero lo que lo rodea no lo era.
  // Nota: la plantilla se pasa con `createElement` en vez de invocarla como
  // funcion — asi su cuerpo se ejecuta dentro del render de Resend (ya cubierto
  // por el try/catch de `enviarCorreo`) y no aqui, de forma ansiosa.
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email) {
      const { data: items } = await supabase
        .from("order_items")
        .select("name_snapshot, qty, line_total")
        .eq("order_id", data.id);

      await enviarCorreo({
        to: user.email,
        subject: `Confirmación de tu pedido ${data.order_number}`,
        react: createElement(ConfirmacionPedidoEmail, {
          orderNumber: data.order_number,
          orderId: data.id,
          items: (items ?? []).map((item) => ({
            nombre: item.name_snapshot,
            qty: item.qty,
            lineTotal: item.line_total,
          })),
          total: data.total,
          direccion: parsed.data,
          metodoPago: parsed.data.paymentMethod,
        }),
      });
    }
  } catch (emailError) {
    console.error(
      `[email] Error preparando o enviando el correo de pedido recibido (${data.order_number}):`,
      emailError,
    );
  }

  redirect(`/cuenta/pedidos/${data.id}?confirmado=1`);
}
