"use server";

import { requireAdmin } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { generarCodigoBarras, generarCodigoQr } from "@/lib/codigos";
import { obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import type { ProductoInput } from "@/lib/validation/producto";

export type InventarioProductoResumen = {
  id: string;
  name: string;
  sku: string;
  price: number;
  promoPrice: number | null;
  stock: number;
  isActive: boolean;
  categoryId: string | null;
  categoryName: string | null;
  imageUrl: string | null;
};

export type InventarioCategoria = { id: string; name: string };

export async function listarProductosInventario(): Promise<{
  productos: InventarioProductoResumen[];
  categorias: InventarioCategoria[];
  umbralStockBajo: number;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const [{ data: productos }, { data: categorias }, umbralStockBajo] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, sku, price, promo_price, stock, is_active, category_id")
      .order("created_at", { ascending: false }),
    supabase.from("categories").select("id, name").order("name"),
    obtenerUmbralStockBajo(),
  ]);

  const categoriaPorId = new Map((categorias ?? []).map((c) => [c.id, c.name]));

  const idsProductos = (productos ?? []).map((p) => p.id);
  const { data: imagenesPrincipales } =
    idsProductos.length > 0
      ? await supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", idsProductos)
          .eq("is_primary", true)
      : { data: [] as { product_id: string; url: string }[] };
  const imagenPorProducto = new Map(
    (imagenesPrincipales ?? []).map((img) => [img.product_id, img.url]),
  );

  return {
    productos: (productos ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      price: p.price,
      promoPrice: p.promo_price,
      stock: p.stock,
      isActive: p.is_active,
      categoryId: p.category_id,
      categoryName: p.category_id ? (categoriaPorId.get(p.category_id) ?? null) : null,
      imageUrl: imagenPorProducto.get(p.id) ?? null,
    })),
    categorias: categorias ?? [],
    umbralStockBajo,
  };
}

export type InventarioProductoParaEditar = {
  productoId: string;
  skuActual: string;
  codigoBarras: string;
  codigoQr: string;
  defaultValues: ProductoInput;
  imagenesExistentes: {
    id: string;
    url: string;
    is_primary: boolean;
    variant_id: string | null;
  }[];
};

export async function obtenerProductoParaEditar(
  id: string,
): Promise<{ producto?: InventarioProductoParaEditar; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: producto } = await supabase.from("products").select("*").eq("id", id).single();
  if (!producto) {
    return { error: "Producto no encontrado." };
  }

  const [{ data: variantes }, { data: imagenes }, { data: costo }, codigoBarras, codigoQr] =
    await Promise.all([
      supabase
        .from("product_variants")
        .select("id, talla, color, price_override, stock")
        .eq("product_id", id),
      supabase
        .from("product_images")
        .select("id, url, is_primary, variant_id")
        .eq("product_id", id)
        .order("sort_order"),
      supabase.from("product_costs").select("cost_price").eq("product_id", id).maybeSingle(),
      generarCodigoBarras(producto.sku),
      generarCodigoQr(producto.sku),
    ]);

  return {
    producto: {
      productoId: producto.id,
      skuActual: producto.sku,
      codigoBarras,
      codigoQr,
      defaultValues: {
        name: producto.name,
        slug: producto.slug,
        description: producto.description ?? "",
        categoryId: producto.category_id,
        price: producto.price,
        promoPrice: producto.promo_price,
        costPrice: costo?.cost_price ?? null,
        stock: producto.stock,
        isActive: producto.is_active,
        isFeatured: producto.is_featured,
        variantes: (variantes ?? []).map((v) => ({
          id: v.id,
          talla: v.talla ?? "",
          color: v.color ?? "",
          priceOverride: v.price_override,
          stock: v.stock,
        })),
      },
      imagenesExistentes: imagenes ?? [],
    },
  };
}
