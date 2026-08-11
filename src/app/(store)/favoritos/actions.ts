"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function addFavorite(productId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { error } = await supabase
    .from("favorites")
    .insert({ user_id: user.id, product_id: productId });

  if (error && error.code !== "23505") {
    return { error: "No se pudo agregar a favoritos." };
  }

  revalidatePath("/favoritos");
  return {};
}

export async function removeFavorite(productId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { error } = await supabase
    .from("favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("product_id", productId);

  if (error) return { error: "No se pudo quitar de favoritos." };

  revalidatePath("/favoritos");
  return {};
}
