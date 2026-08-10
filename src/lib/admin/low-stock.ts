import { createClient } from "@/lib/supabase/server";
import { STORE_SETTINGS_KEYS } from "@/lib/validation/store-settings";

const UMBRAL_STOCK_BAJO_POR_DEFECTO = 5;

export async function obtenerUmbralStockBajo(): Promise<number> {
  const supabase = await createClient();
  const { data: ajuste } = await supabase
    .from("store_settings")
    .select("value")
    .eq("key", STORE_SETTINGS_KEYS.stockBajoUmbral)
    .maybeSingle();
  return Number(ajuste?.value ?? UMBRAL_STOCK_BAJO_POR_DEFECTO);
}

export type LowStockItem = {
  productId: string;
  productName: string;
  variantLabel: string | null;
  stock: number;
};

type ProductoStock = { id: string; name: string; stock: number };
type VarianteStock = {
  id: string;
  product_id: string;
  talla: string | null;
  color: string | null;
  stock: number;
};

export function buildLowStockItems(
  products: ProductoStock[],
  variants: VarianteStock[],
  threshold: number,
): LowStockItem[] {
  const productIdsConVariantes = new Set(variants.map((v) => v.product_id));
  const productNameById = new Map(products.map((p) => [p.id, p.name]));

  const items: LowStockItem[] = [];

  for (const variante of variants) {
    if (variante.stock <= threshold) {
      items.push({
        productId: variante.product_id,
        productName: productNameById.get(variante.product_id) ?? "Producto",
        variantLabel:
          [variante.talla, variante.color].filter(Boolean).join(" / ") || null,
        stock: variante.stock,
      });
    }
  }

  for (const producto of products) {
    if (!productIdsConVariantes.has(producto.id) && producto.stock <= threshold) {
      items.push({
        productId: producto.id,
        productName: producto.name,
        variantLabel: null,
        stock: producto.stock,
      });
    }
  }

  return items.sort((a, b) => a.stock - b.stock);
}
