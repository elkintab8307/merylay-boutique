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

// Reintento de pago para un pedido que ya existe. `create_order_wompi` vacia el
// carrito al crear el pedido pendiente, asi que si el cliente cierra el widget
// sin pagar se queda sin carrito y con un pedido que no puede pagar. Esta accion
// no crea nada (nunca llama a la RPC ni toca el carrito): solo relee el pedido y
// vuelve a calcular la firma de integridad con la MISMA referencia y el MISMO
// monto, para que Wompi trate el reintento como el mismo pago y el webhook lo
// resuelva igual que en el primer intento.
export async function reintentarPagoWompi(
  orderId: string,
): Promise<{ error: string } | PagoWompiIniciado> {
  const credenciales = obtenerCredencialesWompi();
  if ("error" in credenciales) {
    return credenciales;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Inicia sesión para reintentar el pago." };
  }

  // Se filtra por las cuatro condiciones a la vez: el pedido debe ser del
  // usuario autenticado, seguir pendiente y ser de Wompi. Cualquier caso que no
  // cumpla devuelve la misma respuesta generica, sin revelar si el pedido existe.
  const { data: pedido, error } = await supabase
    .from("orders")
    .select("id, order_number, total")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .eq("status", "pendiente")
    .eq("payment_method", "wompi")
    .maybeSingle();

  if (error || !pedido) {
    return { error: "No se pudo reintentar el pago de este pedido." };
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
