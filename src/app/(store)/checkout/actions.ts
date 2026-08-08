"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";

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

  redirect(`/cuenta/pedidos/${data.id}?confirmado=1`);
}
