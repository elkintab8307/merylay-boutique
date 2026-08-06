"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";

export async function confirmarPedido(input: CheckoutInput): Promise<{ error?: string }> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
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
