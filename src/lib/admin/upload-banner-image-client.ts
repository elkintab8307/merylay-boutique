import { createClient } from "@/lib/supabase/client";

/**
 * Sube directo desde el navegador al bucket "banner-images" (RLS ya
 * restringe la escritura a superadmin). A diferencia de subirImagenBanner
 * (Server Action), esto evita que los bytes de la imagen pasen por el
 * limite de payload de las funciones serverless de Vercel (~4.5MB, no
 * configurable desde next.config.ts) cuando se suben varias imagenes a
 * la vez, como el carrusel del hero.
 */
export async function subirImagenBannerCliente(
  file: File,
  prefijo: string,
): Promise<{ url?: string; error?: string }> {
  const supabase = createClient();
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
