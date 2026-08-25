import { createClient } from "@/lib/supabase/client";

/**
 * Sube uno o mas archivos directo desde el navegador al bucket
 * "product-images" (RLS ya restringe la escritura a admin/superadmin).
 * A diferencia de subir los archivos crudos en el body de una Server
 * Action, esto evita el limite de payload (~4.5MB) de las funciones
 * serverless de Vercel — el mismo problema que ya se resolvio para las
 * imagenes de los banners del home (ver upload-banner-image-client.ts).
 */
export async function subirImagenesProductoCliente(
  files: File[],
): Promise<{ urls?: string[]; error?: string }> {
  if (files.length === 0) {
    return { urls: [] };
  }

  const supabase = createClient();

  const resultados = await Promise.all(
    files.map(async (file) => {
      const extension = file.name.split(".").pop() ?? "jpg";
      const path = `${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(path, file);

      if (uploadError) {
        return { error: "No se pudo subir una de las imágenes." };
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("product-images").getPublicUrl(path);

      return { url: publicUrl };
    }),
  );

  const conError = resultados.find((r) => r.error);
  if (conError) {
    return { error: conError.error };
  }

  return { urls: resultados.map((r) => r.url as string) };
}
