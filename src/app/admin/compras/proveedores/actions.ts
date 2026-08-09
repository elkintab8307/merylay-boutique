"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { proveedorSchema, type ProveedorInput } from "@/lib/validation/proveedor";

export async function createProveedor(
  input: ProveedorInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = proveedorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({
    name: parsed.data.name,
    phone: parsed.data.phone || null,
    is_active: parsed.data.isActive,
  });

  if (error) {
    return { error: "No se pudo crear el proveedor." };
  }

  revalidatePath("/admin/compras/proveedores");
  return {};
}

export async function updateProveedor(
  id: string,
  input: ProveedorInput,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = proveedorSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name,
      phone: parsed.data.phone || null,
      is_active: parsed.data.isActive,
    })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el proveedor." };
  }

  revalidatePath("/admin/compras/proveedores");
  return {};
}

export async function toggleProveedorActivo(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el estado del proveedor." };
  }

  revalidatePath("/admin/compras/proveedores");
  return {};
}
