"use server";

import { createClient } from "@/lib/supabase/server";

export async function subirImagenCategoria(
  file: File,
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("category-images")
    .upload(path, file);

  if (uploadError) {
    return { error: "No se pudo subir la imagen." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("category-images").getPublicUrl(path);

  return { url: publicUrl };
}
