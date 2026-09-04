"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { productoSchema, type ProductoInput } from "@/lib/validation/producto";
import { slugify } from "@/lib/slug";
import { guardarImagenesProducto } from "@/lib/admin/upload-product-images";
import { generarSkuVariante } from "@/lib/sku";
import { diffVariantes } from "@/lib/admin/variant-diff";
import { debeGuardarStockManual } from "@/lib/admin/stock-producto";

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
  imageUrls: string[],
  variantImageUrls: string[][],
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name));

  // El tipo generado para el RPC exige `p_category_id: string` (no admite
  // null), pero la funcion SQL (020_sku_automatico.sql) si maneja
  // `p_category_id is not null` explicitamente y cae al prefijo "GEN" sin
  // categoria: el typegen de Supabase no captura la nulabilidad real de
  // los parametros de funcion. La aserción preserva el envio de null en
  // runtime, que es el comportamiento correcto.
  const { data: skuGenerado, error: skuError } = await supabase.rpc(
    "generar_sku_producto",
    { p_category_id: parsed.data.categoryId as string },
  );

  if (skuError || !skuGenerado) {
    return { error: "No se pudo generar el SKU del producto." };
  }

  const { data: producto, error } = await supabase
    .from("products")
    .insert({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      category_id: parsed.data.categoryId,
      price: parsed.data.price,
      promo_price: parsed.data.promoPrice,
      sku: skuGenerado,
      stock: debeGuardarStockManual(parsed.data.variantes.length) ? parsed.data.stock : 0,
      is_active: parsed.data.isActive,
      is_featured: parsed.data.isFeatured,
    })
    .select("id")
    .single();

  if (error || !producto) {
    return { error: "No se pudo crear el producto." };
  }

  let variantIdPorIndice: (string | null)[] = [];
  if (parsed.data.variantes.length > 0) {
    const { data: variantesCreadas, error: variantesError } = await supabase
      .from("product_variants")
      .insert(
        parsed.data.variantes.map((variante) => ({
          product_id: producto.id,
          name: nombreVariante(variante.talla, variante.color),
          talla: variante.talla || null,
          color: variante.color || null,
          sku: generarSkuVariante(skuGenerado, variante.talla || null, variante.color || null),
          price_override: variante.priceOverride,
        })),
      )
      .select("id");

    if (variantesError || !variantesCreadas) {
      return {
        error: "El producto se creo, pero hubo un error con las variantes.",
      };
    }

    variantIdPorIndice = variantesCreadas.map((v) => v.id);
  }

  if (parsed.data.costPrice !== null) {
    const { error: costoError } = await supabase.from("product_costs").upsert({
      product_id: producto.id,
      cost_price: parsed.data.costPrice,
      updated_at: new Date().toISOString(),
    });

    if (costoError) {
      return { error: "El producto se creo, pero hubo un error al guardar el costo." };
    }
  }

  if (imageUrls.length > 0) {
    const guardarResult = await guardarImagenesProducto(producto.id, imageUrls, null);
    if (guardarResult.error) {
      return { error: guardarResult.error };
    }
  }

  for (const [index, urls] of variantImageUrls.entries()) {
    if (urls.length === 0) continue;
    const variantId = variantIdPorIndice[index];
    if (!variantId) continue;
    const guardarResult = await guardarImagenesProducto(producto.id, urls, variantId);
    if (guardarResult.error) {
      return { error: guardarResult.error };
    }
  }

  revalidatePath("/admin/productos");
  return {};
}

export async function updateProducto(
  id: string,
  input: ProductoInput,
  newImageUrls: string[],
  variantImageUrls: string[][],
): Promise<{ error?: string }> {
  await requireAdmin();

  const parsed = productoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: "Revisa los datos ingresados." };
  }

  const supabase = await createClient();
  const slug = await uniqueSlug(slugify(parsed.data.slug || parsed.data.name), id);

  const { data: productoActualizado, error } = await supabase
    .from("products")
    .update({
      name: parsed.data.name,
      slug,
      description: parsed.data.description || null,
      category_id: parsed.data.categoryId,
      price: parsed.data.price,
      promo_price: parsed.data.promoPrice,
      ...(debeGuardarStockManual(parsed.data.variantes.length)
        ? { stock: parsed.data.stock }
        : {}),
      is_active: parsed.data.isActive,
      is_featured: parsed.data.isFeatured,
    })
    .eq("id", id)
    .select("sku")
    .single();

  if (error || !productoActualizado) {
    return { error: "No se pudo actualizar el producto." };
  }

  const { data: variantesExistentes, error: variantesExistentesError } = await supabase
    .from("product_variants")
    .select("id")
    .eq("product_id", id);

  if (variantesExistentesError) {
    return {
      error: "El producto se actualizo, pero no se pudieron leer las variantes existentes.",
    };
  }

  const idsExistentes = (variantesExistentes ?? []).map((v) => v.id);

  const diff = diffVariantes(parsed.data.variantes, idsExistentes);

  if (diff.borrarIds.length > 0) {
    const { error: borrarError } = await supabase
      .from("product_variants")
      .delete()
      .in("id", diff.borrarIds);

    if (borrarError) {
      return {
        error:
          "El producto se actualizo, pero no se pudieron quitar una o mas variantes porque ya tienen compras registradas.",
      };
    }
  }

  const variantIdPorIndice: (string | null)[] = new Array(parsed.data.variantes.length).fill(
    null,
  );

  const actualizarItems = diff.items.filter(
    (item): item is Extract<(typeof diff.items)[number], { tipo: "actualizar" }> =>
      item.tipo === "actualizar",
  );
  const crearItems = diff.items.filter(
    (item): item is Extract<(typeof diff.items)[number], { tipo: "crear" }> =>
      item.tipo === "crear",
  );

  if (actualizarItems.length > 0) {
    const { error: actualizarError } = await supabase.from("product_variants").upsert(
      actualizarItems.map((item) => ({
        id: item.id,
        product_id: id,
        name: nombreVariante(item.variante.talla, item.variante.color),
        talla: item.variante.talla || null,
        color: item.variante.color || null,
        sku: generarSkuVariante(
          productoActualizado.sku,
          item.variante.talla || null,
          item.variante.color || null,
        ),
        price_override: item.variante.priceOverride,
      })),
      { onConflict: "id" },
    );

    if (actualizarError) {
      return { error: "El producto se actualizo, pero hubo un error con las variantes." };
    }

    for (const item of actualizarItems) {
      variantIdPorIndice[item.index] = item.id;
    }
  }

  if (crearItems.length > 0) {
    const { data: variantesCreadas, error: crearError } = await supabase
      .from("product_variants")
      .insert(
        crearItems.map((item) => ({
          product_id: id,
          name: nombreVariante(item.variante.talla, item.variante.color),
          talla: item.variante.talla || null,
          color: item.variante.color || null,
          sku: generarSkuVariante(
            productoActualizado.sku,
            item.variante.talla || null,
            item.variante.color || null,
          ),
          price_override: item.variante.priceOverride,
        })),
      )
      .select("id");

    if (crearError || !variantesCreadas) {
      return { error: "El producto se actualizo, pero hubo un error con las variantes." };
    }

    crearItems.forEach((item, i) => {
      variantIdPorIndice[item.index] = variantesCreadas[i].id;
    });
  }

  if (parsed.data.costPrice !== null) {
    const { error: costoError } = await supabase.from("product_costs").upsert({
      product_id: id,
      cost_price: parsed.data.costPrice,
      updated_at: new Date().toISOString(),
    });

    if (costoError) {
      return { error: "El producto se actualizo, pero hubo un error al guardar el costo." };
    }
  }

  if (newImageUrls.length > 0) {
    const guardarResult = await guardarImagenesProducto(id, newImageUrls, null);
    if (guardarResult.error) {
      return { error: guardarResult.error };
    }
  }

  for (const [index, urls] of variantImageUrls.entries()) {
    if (urls.length === 0) continue;
    const variantId = variantIdPorIndice[index];
    if (!variantId) continue;
    const guardarResult = await guardarImagenesProducto(id, urls, variantId);
    if (guardarResult.error) {
      return { error: guardarResult.error };
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

// Borra un producto solo si nada mas depende de el: las llaves foraneas de
// order_items/pos_sale_items/purchase_items/cart_items hacia products son
// "NO ACTION" (no CASCADE), asi que un delete crudo fallaria con un error
// de Postgres poco claro si el producto ya tiene alguna de estas
// referencias. Se valida antes, con un mensaje explicando por que no se
// puede y que se puede desactivar en su lugar.
export async function eliminarProducto(id: string): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();

  const [{ data: ventaOrder }, { data: ventaPos }, { data: compra }, { data: enCarrito }] =
    await Promise.all([
      supabase.from("order_items").select("id").eq("product_id", id).limit(1),
      supabase.from("pos_sale_items").select("id").eq("product_id", id).limit(1),
      supabase.from("purchase_items").select("id").eq("product_id", id).limit(1),
      supabase.from("cart_items").select("id").eq("product_id", id).limit(1),
    ]);

  if ((ventaOrder?.length ?? 0) > 0 || (ventaPos?.length ?? 0) > 0) {
    return {
      error:
        "Este producto ya tiene ventas registradas y no se puede eliminar. Desactívalo en su lugar.",
    };
  }
  if ((compra?.length ?? 0) > 0) {
    return {
      error:
        "Este producto tiene compras registradas y no se puede eliminar. Desactívalo en su lugar.",
    };
  }
  if ((enCarrito?.length ?? 0) > 0) {
    return {
      error:
        "Este producto está en el carrito de un cliente en este momento y no se puede eliminar todavía. Desactívalo en su lugar.",
    };
  }

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    return { error: "No se pudo eliminar el producto." };
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

export async function toggleImagenVendida(
  imageId: string,
  vendida: boolean,
  productId: string,
): Promise<{ error?: string }> {
  await requireAdmin();

  const supabase = await createClient();
  const { error } = await supabase
    .from("product_images")
    .update({ vendida })
    .eq("id", imageId);

  if (error) {
    return { error: "No se pudo actualizar la disponibilidad de la foto." };
  }

  revalidatePath(`/admin/productos/${productId}/editar`);
  return {};
}
