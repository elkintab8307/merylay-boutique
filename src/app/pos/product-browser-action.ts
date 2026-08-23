"use server";

import { createClient } from "@/lib/supabase/server";
import type { VariantOption } from "@/lib/store/variants";
import { precioEfectivo } from "@/lib/store/discount";
import { obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import { sanitizarQueryBusqueda } from "@/lib/search/sanitize";

export type PosProductoResult = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  imageUrl: string | null;
  variants: VariantOption[];
};

export async function buscarProductosPos(params: {
  query: string;
  categoryId: string | null;
}): Promise<PosProductoResult[]> {
  const trimmed = sanitizarQueryBusqueda(params.query);

  const supabase = await createClient();
  let productsQuery = supabase
    .from("products")
    .select("id, name, sku, price, promo_price, stock, category_id")
    .eq("is_active", true)
    .order("name")
    .limit(60);

  if (trimmed) {
    productsQuery = productsQuery.or(`name.ilike.%${trimmed}%,sku.ilike.%${trimmed}%`);
  }
  if (params.categoryId) {
    productsQuery = productsQuery.eq("category_id", params.categoryId);
  }

  const { data: products, error: productsError } = await productsQuery;
  if (productsError) throw productsError;
  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const [
    { data: variants, error: variantsError },
    { data: images, error: imagesError },
  ] = await Promise.all([
    supabase
      .from("product_variants")
      .select("id, product_id, talla, color, sku, stock, price_override")
      .in("product_id", productIds)
      .order("talla"),
    supabase
      .from("product_images")
      .select("product_id, url")
      .in("product_id", productIds)
      .eq("is_primary", true),
  ]);
  if (variantsError) throw variantsError;
  if (imagesError) throw imagesError;

  const imagenPorProducto = new Map((images ?? []).map((img) => [img.product_id, img.url]));

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: precioEfectivo(p.price, p.promo_price),
    stock: p.stock,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
    variants: (variants ?? [])
      .filter((v) => v.product_id === p.id)
      .map((v) => ({
        id: v.id,
        talla: v.talla,
        color: v.color,
        sku: v.sku,
        stock: v.stock,
        priceOverride: v.price_override,
      })),
  }));
}

export type PosCategoriaResult = {
  id: string;
  name: string;
  imageUrl: string | null;
};

export async function listarCategoriasPos(): Promise<PosCategoriaResult[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, name, image_url")
    .eq("is_active", true)
    .is("parent_id", null)
    .order("sort_order");

  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name, imageUrl: c.image_url }));
}

export async function obtenerUmbralStockBajoPos(): Promise<number> {
  return obtenerUmbralStockBajo();
}
