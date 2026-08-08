"use server";

import { createClient } from "@/lib/supabase/server";
import { checkoutSchema, type CheckoutInput } from "@/lib/validation/checkout";
import { calcularFirmaIntegridad } from "@/lib/wompi/signature";

type PagoWompiIniciado = {
  orderId: string;
  reference: string;
  amountInCents: number;
  currency: string;
  publicKey: string;
  signature: string;
};

export async function iniciarPagoWompi(
  input: CheckoutInput,
): Promise<{ error: string } | PagoWompiIniciado> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success || parsed.data.paymentMethod !== "wompi") {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { data: pedido, error } = await supabase.rpc("create_order_wompi", {
    p_shipping_address: {
      fullName: parsed.data.fullName,
      phone: parsed.data.phone,
      address: parsed.data.address,
      city: parsed.data.city,
      notes: parsed.data.notes || null,
    },
  });

  if (error || !pedido) {
    return { error: error?.message ?? "No se pudo iniciar el pago." };
  }

  const amountInCents = Math.round(pedido.total * 100);
  const currency = "COP";
  const signature = calcularFirmaIntegridad(
    pedido.order_number,
    amountInCents,
    currency,
    process.env.WOMPI_INTEGRITY_SECRET!,
  );

  return {
    orderId: pedido.id,
    reference: pedido.order_number,
    amountInCents,
    currency,
    publicKey: process.env.WOMPI_PUBLIC_KEY!,
    signature,
  };
}
