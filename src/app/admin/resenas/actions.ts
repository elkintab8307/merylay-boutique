"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { resenaSchema, type ResenaInput } from "@/lib/validation/resena";
import { subirImagenResena } from "@/lib/admin/upload-review-image";

export async function createResena(
  input: ResenaInput,
  imageFile: File | null,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = resenaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  let imageUrl: string | null = null;
  if (imageFile) {
    const uploadResult = await subirImagenResena(imageFile);
    if (uploadResult.error) return { error: uploadResult.error };
    imageUrl = uploadResult.url ?? null;
  }

  const supabase = await createClient();
  const { error } = await supabase.from("reviews").insert({
    customer_name: parsed.data.customerName,
    body: parsed.data.body,
    rating: parsed.data.rating,
    sort_order: parsed.data.sortOrder,
    is_active: parsed.data.isActive,
    image_url: imageUrl,
  });

  if (error) {
    return { error: "No se pudo crear la reseña." };
  }

  revalidatePath("/admin/resenas");
  revalidatePath("/");
  return {};
}

export async function updateResena(
  id: string,
  input: ResenaInput,
  imageFile: File | null,
  imagenActual: string | null,
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = resenaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  let imageUrl = imagenActual;
  if (imageFile) {
    const uploadResult = await subirImagenResena(imageFile);
    if (uploadResult.error) return { error: uploadResult.error };
    imageUrl = uploadResult.url ?? imagenActual;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({
      customer_name: parsed.data.customerName,
      body: parsed.data.body,
      rating: parsed.data.rating,
      sort_order: parsed.data.sortOrder,
      is_active: parsed.data.isActive,
      image_url: imageUrl,
    })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar la reseña." };
  }

  revalidatePath("/admin/resenas");
  revalidatePath("/");
  return {};
}

export async function toggleResenaActiva(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("reviews")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el estado de la reseña." };
  }

  revalidatePath("/admin/resenas");
  revalidatePath("/");
  return {};
}
