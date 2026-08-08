"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { gastoSchema, type GastoInput } from "@/lib/validation/gasto";

export async function createGasto(input: GastoInput): Promise<{ error?: string }> {
  const currentUser = await requireAdmin();

  const parsed = gastoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").insert({
    category_id: parsed.data.categoryId,
    description: parsed.data.description,
    amount: parsed.data.amount,
    expense_date: parsed.data.expenseDate,
    created_by: currentUser.id,
  });

  if (error) {
    return { error: "No se pudo registrar el gasto." };
  }

  revalidatePath("/admin/gastos");
  return {};
}

export async function updateGasto(
  id: string,
  input: GastoInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = gastoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expenses")
    .update({
      category_id: parsed.data.categoryId,
      description: parsed.data.description,
      amount: parsed.data.amount,
      expense_date: parsed.data.expenseDate,
    })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el gasto." };
  }

  revalidatePath("/admin/gastos");
  return {};
}

export async function deleteGasto(id: string): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase.from("expenses").delete().eq("id", id);

  if (error) {
    return { error: "No se pudo eliminar el gasto." };
  }

  revalidatePath("/admin/gastos");
  return {};
}
