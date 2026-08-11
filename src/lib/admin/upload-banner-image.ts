"use server";

import { createClient } from "@/lib/supabase/server";

export async function subirImagenBanner(
  file: File,
  prefijo: string,
): Promise<{ url?: string; error?: string }> {
  const supabase = await createClient();
  const extension = file.name.split(".").pop() ?? "jpg";
  const path = `${prefijo}/${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("banner-images")
    .upload(path, file);

  if (uploadError) {
    return { error: "No se pudo subir la imagen." };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("banner-images").getPublicUrl(path);

  return { url: publicUrl };
}
