"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { abonoSchema, type AbonoInput } from "@/lib/validation/credito";

export async function registrarAbono(
  saleId: string,
  input: AbonoInput,
): Promise<{ error?: string }> {
  const parsed = abonoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Revisa los datos del abono." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("registrar_abono_credito", {
    p_sale_id: saleId,
    p_amount: parsed.data.amount,
    p_payment_method: parsed.data.paymentMethod,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/pos/creditos/${saleId}`);
  revalidatePath("/pos/creditos");
  return {};
}
