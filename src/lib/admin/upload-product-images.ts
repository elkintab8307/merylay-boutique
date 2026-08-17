"use server";

import { createClient } from "@/lib/supabase/server";

export async function uploadProductImages(
  productId: string,
  files: File[],
  variantId: string | null = null,
): Promise<{ error?: string }> {
  if (files.length === 0) {
    return {};
  }

  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("product_images")
    .select("id, is_primary")
    .eq("product_id", productId);

  let sortOrder = existing?.length ?? 0;
  const hasPrimaryAlready = (existing ?? []).some((img) => img.is_primary);

  for (const [index, file] of files.entries()) {
    const extension = file.name.split(".").pop() ?? "jpg";
    const path = `${productId}/${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from("product-images")
      .upload(path, file);

    if (uploadError) {
      return { error: "No se pudo subir una de las imágenes." };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("product-images").getPublicUrl(path);

    const { error: insertError } = await supabase.from("product_images").insert({
      product_id: productId,
      variant_id: variantId,
      url: publicUrl,
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
