"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import { creditoVentaSchema, type CreditoVentaInput } from "@/lib/validation/credito";

type PaymentMethod = Database["public"]["Enums"]["payment_method"];

export async function registrarVenta(
  items: LocalCartItem[],
  paymentMethod: PaymentMethod,
  discount: number,
  credito: CreditoVentaInput | null,
): Promise<{ error?: string }> {
  if (items.length === 0) {
    return { error: "Agrega al menos un producto a la venta." };
  }

  let creditoValidado: CreditoVentaInput | null = null;
  if (paymentMethod === "credito") {
    const parsed = creditoVentaSchema.safeParse(credito);
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del crédito." };
    }
    creditoValidado = parsed.data;
  }

  const supabase = await createClient();
  // Los parámetros p_credit_* del RPC son `default null` en Postgres, pero el
  // generador de tipos de Supabase los tipa como `T | undefined` (sin `null`)
  // por tratarse de argumentos opcionales. La aserción de tipo es necesaria
  // para poder enviar `null` explícito, que es lo que el RPC espera cuando
  // la venta no es a crédito.
  const { data, error } = await supabase.rpc("create_pos_sale", {
    p_items: items.map((item) => ({
      productId: item.productId,
      variantId: item.variantId ?? "",
      qty: item.qty,
      unitPrice: item.unitPrice,
    })),
    p_payment_method: paymentMethod,
    p_discount: discount,
    p_credit_customer_name: creditoValidado?.clienteNombre ?? null,
    p_credit_customer_phone: creditoValidado?.clienteTelefono ?? null,
    p_credit_num_cuotas: creditoValidado?.numCuotas ?? null,
    p_credit_abono_inicial: creditoValidado?.abonoInicial ?? 0,
    p_credit_abono_metodo: creditoValidado?.abonoInicialMetodo ?? null,
  } as Database["public"]["Functions"]["create_pos_sale"]["Args"]);

  if (error || !data) {
    return { error: error?.message ?? "No se pudo registrar la venta." };
  }

  redirect(`/pos/venta/${data.id}`);
}
