"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { calificacionSchema, type CalificacionInput } from "@/lib/validation/calificacion";

export async function guardarCalificacion(
  productId: string,
  productSlug: string,
  input: CalificacionInput,
): Promise<{ error?: string }> {
  const parsed = calificacionSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Debes iniciar sesión para calificar." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { error } = await supabase.from("product_ratings").upsert(
    {
      product_id: productId,
      user_id: user.id,
      rating: parsed.data.rating,
      comment: parsed.data.comment || null,
      author_name: profile?.full_name ?? "Clienta MeryLay",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "product_id,user_id" },
  );

  if (error) {
    return { error: "No se pudo guardar tu calificación." };
  }

  revalidatePath(`/producto/${productSlug}`);
  return {};
}
