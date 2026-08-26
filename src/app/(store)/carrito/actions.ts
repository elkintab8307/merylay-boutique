"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrCreateCart } from "@/lib/cart/get-or-create-cart";

export async function addToCart(
  productId: string,
  variantId: string | null,
  imageId: string | null,
  qty: number,
  unitPrice: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Debes iniciar sesión." };
  }

  const cartId = await getOrCreateCart(user.id);

  let existingQuery = supabase
    .from("cart_items")
    .select("id, qty")
    .eq("cart_id", cartId)
    .eq("product_id", productId);
  existingQuery = variantId
    ? existingQuery.eq("variant_id", variantId)
    : existingQuery.is("variant_id", null);
  existingQuery = imageId
    ? existingQuery.eq("image_id", imageId)
    : existingQuery.is("image_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("cart_items")
      .update({ qty: existing.qty + qty })
      .eq("id", existing.id);
    if (error) return { error: "No se pudo actualizar el carrito." };
  } else {
    const { error } = await supabase.from("cart_items").insert({
      cart_id: cartId,
      product_id: productId,
      variant_id: variantId,
      image_id: imageId,
      qty,
      unit_price: unitPrice,
    });
    if (error) return { error: "No se pudo agregar al carrito." };
  }

  revalidatePath("/carrito");
  revalidatePath("/", "layout");
  return {};
}

export async function updateCartItemImage(
  cartItemId: string,
  imageId: string,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  const { data: cartItem } = await supabase
    .from("cart_items")
    .select("variant_id")
    .eq("id", cartItemId)
    .maybeSingle();
  if (!cartItem) return { error: "No se pudo cambiar el estampado." };

  // Confirma que la imagen elegida pertenece a la variante de esta linea.
  // No es un problema de seguridad (product_images ya es de lectura publica
  // para productos activos, y RLS acota la fila al dueno del carrito), pero
  // un imageId ajeno viajaria intacto hasta order_items y el panel de
  // pedidos lo resuelve por id directo, sin volver a acotarlo a la
  // variante: mostraria al operario la foto equivocada como "el estampado
  // a enviar".
  let imagenQuery = supabase.from("product_images").select("id").eq("id", imageId);
  imagenQuery = cartItem.variant_id
    ? imagenQuery.eq("variant_id", cartItem.variant_id)
    : imagenQuery.is("variant_id", null);
  const { data: imagenValida } = await imagenQuery.maybeSingle();
  if (!imagenValida) return { error: "Estampado inválido para esta variante." };

  const { error } = await supabase
    .from("cart_items")
    .update({ image_id: imageId })
    .eq("id", cartItemId);
  if (error) return { error: "No se pudo cambiar el estampado." };
  revalidatePath("/carrito");
  return {};
}

export async function updateCartItemQty(
  cartItemId: string,
  qty: number,
): Promise<{ error?: string }> {
  const supabase = await createClient();

  if (qty <= 0) {
    const { error } = await supabase.from("cart_items").delete().eq("id", cartItemId);
    if (error) return { error: "No se pudo actualizar el carrito." };
  } else {
    const { error } = await supabase.from("cart_items").update({ qty }).eq("id", cartItemId);
    if (error) return { error: "No se pudo actualizar el carrito." };
  }

  revalidatePath("/carrito");
  revalidatePath("/", "layout");
  return {};
}

export async function removeCartItem(cartItemId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("cart_items").delete().eq("id", cartItemId);
  if (error) return { error: "No se pudo eliminar el producto del carrito." };
  revalidatePath("/carrito");
  revalidatePath("/", "layout");
  return {};
}
