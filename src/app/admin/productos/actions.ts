"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { productoSchema, type ProductoInput } from "@/lib/validation/producto";
import { slugify } from "@/lib/slug";
import { uploadProductImages } from "@/lib/admin/upload-product-images";

async function uniqueSlug(baseSlug: string, ignoreId?: string) {
  const supabase = await createClient();
  let candidate = baseSlug;
  let suffix = 1;

  while (true) {
    let query = supabase.from("products").select("id").eq("slug", candidate);
    if (ignoreId) {
      query = query.neq("id", ignoreId);
    }
    const { data } = await query.maybeSingle();
    if (!data) return candidate;
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

function nombreVariante(talla?: string, color?: string) {
  return [talla, color].filter(Boolean).join(" / ") || "Variante";
}

export async function createProducto(
  input: ProductoInput,
  imageFiles: File[],
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name));

  const { data: producto, error } = await supabase
    .from("products")
    .insert({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      category_id: parsed.data.categoryId,
      price: parsed.data.price,
      compare_at_price: parsed.data.compareAtPrice,
      sku: parsed.data.sku,
      stock: parsed.data.stock,
      is_active: parsed.data.isActive,
      is_featured: parsed.data.isFeatured,
    })
    .select("id")
    .single();

  if (error || !producto) {
    return {
      error: "No se pudo crear el producto. Verifica que el SKU no este repetido.",
    };
  }

  if (parsed.data.variantes.length > 0) {
    const { error: variantesError } = await supabase.from("product_variants").insert(
      parsed.data.variantes.map((variante) => ({
        product_id: producto.id,
        name: nombreVariante(variante.talla, variante.color),
        talla: variante.talla || null,
        color: variante.color || null,
        sku: variante.sku,
        price_override: variante.priceOverride,
        stock: variante.stock,
      })),
    );

    if (variantesError) {
      return {
        error: "El producto se creo, pero hubo un error con las variantes. Revisa los SKU.",
      };
    }
  }

  if (imageFiles.length > 0) {
    const uploadResult = await uploadProductImages(producto.id, imageFiles);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  revalidatePath("/admin/productos");
  return {};
}

export async function updateProducto(
  id: string,
  input: ProductoInput,
  newImageFiles: File[],
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name), id);

  const { error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      category_id: parsed.data.categoryId,
      price: parsed.data.price,
      compare_at_price: parsed.data.compareAtPrice,
      sku: parsed.data.sku,
      stock: parsed.data.stock,
      is_active: parsed.data.isActive,
      is_featured: parsed.data.isFeatured,
    })
    .eq("id", id);

  if (error) {
    return {
      error: "No se pudo actualizar el producto. Verifica que el SKU no este repetido.",
    };
  }

  // Nota: estrategia simple de "borrar y reinsertar" variantes. Es segura
  // mientras no existan cart_items/order_items referenciando variant_id
  // (eso ocurre a partir de la Fase 7); si en el futuro una variante ya
  // vendida se elimina aqui, el DELETE fallara por la FK sin ON DELETE
  // CASCADE en esas tablas — revisar entonces una estrategia de diff en vez
  // de reemplazo total.
  await supabase.from("product_variants").delete().eq("product_id", id);

  if (parsed.data.variantes.length > 0) {
    const { error: variantesError } = await supabase.from("product_variants").insert(
      parsed.data.variantes.map((variante) => ({
        product_id: id,
        name: nombreVariante(variante.talla, variante.color),
        talla: variante.talla || null,
        color: variante.color || null,
        sku: variante.sku,
        price_override: variante.priceOverride,
        stock: variante.stock,
      })),
    );

    if (variantesError) {
      return { error: "El producto se actualizo, pero hubo un error con las variantes." };
    }
  }

  if (newImageFiles.length > 0) {
    const uploadResult = await uploadProductImages(id, newImageFiles);
    if (uploadResult.error) {
      return { error: uploadResult.error };
    }
  }

  revalidatePath("/admin/productos");
  revalidatePath(`/admin/productos/${id}/editar`);
  return {};
}

export async function toggleProductoActivo(
  id: string,
  isActive: boolean,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { error: "No se pudo actualizar el estado del producto." };
  }

  revalidatePath("/admin/productos");
  return {};
}

export async function deleteProductImage(
  imageId: string,
  productId: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  // Nota: borra la fila de product_images pero no el archivo en Storage
  // (solo guardamos la URL publica, no la ruta cruda). El archivo huerfano
  // no afecta la funcionalidad; limpiarlo queda como mejora futura si el
  // volumen de Storage lo amerita.
  const supabase = await createClient();
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);

  if (error) {
    return { error: "No se pudo eliminar la imagen." };
  }

  revalidatePath(`/admin/productos/${productId}/editar`);
  return {};
}

export async function setPrimaryProductImage(
  imageId: string,
  productId: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  await supabase
    .from("product_images")
    .update({ is_primary: false })
    .eq("product_id", productId);

  const { error } = await supabase
    .from("product_images")
    .update({ is_primary: true })
    .eq("id", imageId);

  if (error) {
    return { error: "No se pudo marcar la imagen como principal." };
  }

  revalidatePath(`/admin/productos/${productId}/editar`);
  return {};
}
