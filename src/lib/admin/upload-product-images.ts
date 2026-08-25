"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Registra en product_images las URLs de imagenes ya subidas al bucket
 * "product-images" desde el navegador (ver upload-product-images-client.ts).
 * Este paso solo escribe un puñado de filas — el payload nunca incluye
 * los bytes de la imagen, asi que no choca con el limite de payload de
 * las funciones serverless de Vercel.
 */
export async function guardarImagenesProducto(
  productId: string,
  urls: string[],
  variantId: string | null = null,
): Promise<{ error?: string }> {
  if (urls.length === 0) {
    return {};
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("product_images")
    .select("id, is_primary")
    .eq("product_id", productId);

  let sortOrder = existing?.length ?? 0;
  const hasPrimaryAlready = (existing ?? []).some((img) => img.is_primary);

  for (const [index, url] of urls.entries()) {
    const { error: insertError } = await supabase.from("product_images").insert({
      product_id: productId,
      variant_id: variantId,
      url,
      sort_order: sortOrder,
      is_primary: !hasPrimaryAlready && index === 0,
    });

    if (insertError) {
      return { error: "No se pudo registrar una de las imágenes." };
    }

    sortOrder += 1;
  }

  return {};
}
