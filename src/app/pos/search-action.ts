"use server";

import { createClient } from "@/lib/supabase/server";
import type { VariantOption } from "@/lib/store/variants";
import { precioEfectivo } from "@/lib/store/discount";

export type PosSearchResult = {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  variants: VariantOption[];
};

export async function searchProducts(query: string): Promise<PosSearchResult[]> {
  const trimmed = query.trim().replace(/[%,()]/g, "");
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, sku, price, promo_price, stock")
    .or(`name.ilike.%${trimmed}%,sku.ilike.%${trimmed}%`)
    .eq("is_active", true)
    .limit(10);

  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const { data: variants } = await supabase
    .from("product_variants")
    .select("id, product_id, talla, color, sku, stock, price_override")
    .in("product_id", productIds);

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: precioEfectivo(p.price, p.promo_price),
    stock: p.stock,
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
