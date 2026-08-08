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

const MONEDA = "COP";

// Fail-closed: si falta alguna de las dos variables, `process.env.X!` seria
// `undefined` y se interpolaria como el string literal "undefined" dentro del
// hash de `calcularFirmaIntegridad` (ver `${secret}` en signature.ts). El
// resultado seria una firma basura devuelta como si fuera valida, que Wompi
// rechazaria al abrir el widget. Y, sin este guard, eso ocurriria DESPUES de
// que `create_order_wompi` ya vacio el carrito del cliente: quedaria sin
// carrito, con un pedido pendiente imposible de pagar y sin ni un solo log
// en el servidor explicando por que. Por eso se valida antes de tocar la RPC.
function obtenerCredencialesWompi():
  | { error: string }
  | { secretoIntegridad: string; publicKey: string } {
  const secretoIntegridad = process.env.WOMPI_INTEGRITY_SECRET;
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  if (!secretoIntegridad || !publicKey) {
    console.error("[wompi] WOMPI_INTEGRITY_SECRET o WOMPI_PUBLIC_KEY no configurados.");
    return {
      error: "El pago en línea no está disponible en este momento. Intenta con otro método.",
    };
  }
  return { secretoIntegridad, publicKey };
}

export async function iniciarPagoWompi(
  input: CheckoutInput,
): Promise<{ error: string } | PagoWompiIniciado> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success || parsed.data.paymentMethod !== "wompi") {
    return { error: "Revisa los datos ingresados." };
  }

  const credenciales = obtenerCredencialesWompi();
  if ("error" in credenciales) {
    return credenciales;
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
  const signature = calcularFirmaIntegridad(
    pedido.order_number,
    amountInCents,
    MONEDA,
    credenciales.secretoIntegridad,
  );

  return {
    orderId: pedido.id,
    reference: pedido.order_number,
    amountInCents,
    currency: MONEDA,
    publicKey: credenciales.publicKey,
    signature,
  };
}
