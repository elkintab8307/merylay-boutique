"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import {
  expenseCategoriaSchema,
  type ExpenseCategoriaInput,
} from "@/lib/validation/gasto";

export async function createExpenseCategoria(
  input: ExpenseCategoriaInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = expenseCategoriaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("expense_categories").insert({
    name: parsed.data.name,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return { error: "No se pudo crear la categoría." };
  }

  revalidatePath("/admin/gastos/categorias");
  return {};
}

export async function updateExpenseCategoria(
  id: string,
  input: ExpenseCategoriaInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = expenseCategoriaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_categories")
    .update({ name: parsed.data.name, is_active: parsed.data.isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar la categoría." };
  }

  revalidatePath("/admin/gastos/categorias");
  return {};
}

export async function toggleExpenseCategoriaActiva(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("expense_categories")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el estado de la categoría." };
  }

  revalidatePath("/admin/gastos/categorias");
  return {};
}
