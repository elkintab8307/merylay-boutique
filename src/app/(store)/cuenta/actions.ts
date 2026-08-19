"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { perfilSchema, type PerfilInput } from "@/lib/validation/cuenta";
import {
  resenaClienteSchema,
  type ResenaClienteInput,
} from "@/lib/validation/resena";

export async function actualizarPerfil(
  input: PerfilInput,
): Promise<{ error?: string }> {
  const parsed = perfilSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.fullName,
      whatsapp: parsed.data.whatsapp,
      address: parsed.data.address,
    })
    .eq("id", user.id);

  if (error) {
    return { error: "No se pudo actualizar tu perfil." };
  }

  revalidatePath("/cuenta");
  return {};
}

export async function guardarResena(
  input: ResenaClienteInput,
): Promise<{ error?: string }> {
  const parsed = resenaClienteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const { error } = await supabase.from("reviews").upsert(
    {
      user_id: user.id,
      customer_name: profile?.full_name ?? "Clienta MeryLay",
      rating: parsed.data.rating,
      body: parsed.data.body,
      is_active: false,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return { error: "No se pudo guardar tu reseña." };
  }

  revalidatePath("/cuenta");
  revalidatePath("/");
  return {};
}
