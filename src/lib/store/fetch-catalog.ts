import type { createClient } from "@/lib/supabase/server";
import { getVariantOptions } from "./variants";
import { calcularDescuento } from "./discount";
import { productoAgotado } from "./stock";
import type { ProductCardData } from "@/components/store/product-card";

export type FetchCatalogParams = {
  categoryId?: string;
  searchQuery?: string;
  minPrice?: number;
  maxPrice?: number;
  tallas: string[];
  colores: string[];
  sort: { key: string; column: "is_featured" | "price" | "created_at"; ascending: boolean };
  userId: string | null;
  soloPromociones?: boolean;
};

export type CatalogResult = {
  productos: ProductCardData[];
  tallas: string[];
  colores: string[];
  favoritosSet: Set<string>;
};

export async function fetchCatalogProducts(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: FetchCatalogParams,
): Promise<CatalogResult> {
  const {
    categoryId,
    searchQuery,
    minPrice,
    maxPrice,
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    sort,
    userId,
    soloPromociones,
  } = params;

  let query = supabase
    .from("products")
    .select("id, name, slug, price, promo_price, stock")
    .eq("is_active", true);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }
  if (searchQuery) {
    query = query.ilike("name", `%${searchQuery}%`);
  }
  if (minPrice !== undefined && !Number.isNaN(minPrice)) {
    query = query.gte("price", minPrice);
  }
  if (maxPrice !== undefined && !Number.isNaN(maxPrice)) {
    query = query.lte("price", maxPrice);
  }

  query = query
    .order(sort.column, { ascending: sort.ascending })
    .order("created_at", { ascending: false });

  const { data: productosBase } = await query;

  const productosEnPromocion = soloPromociones
    ? (productosBase ?? []).filter(
        (p) => calcularDescuento(p.price, p.promo_price) !== null,
      )
    : (productosBase ?? []);

  const productIds = productosEnPromocion.map((p) => p.id);
  const { data: variantes } =
    productIds.length > 0
      ? await supabase
          .from("product_variants")
          .select("product_id, talla, color, stock")
          .in("product_id", productIds)
      : {
          data: [] as {
            product_id: string;
            talla: string | null;
            color: string | null;
            stock: number;
          }[],
        };

  const { tallas, colores } = getVariantOptions(
    (variantes ?? []).map((v) => ({
      id: "",
      talla: v.talla,
      color: v.color,
      sku: "",
      stock: 0,
      priceOverride: null,
    })),
  );

  const stocksVariantesPorProducto = new Map<string, number[]>();
  for (const v of variantes ?? []) {
    const actuales = stocksVariantesPorProducto.get(v.product_id) ?? [];
    actuales.push(v.stock);
    stocksVariantesPorProducto.set(v.product_id, actuales);
  }
  const productosConStock = productosEnPromocion.filter(
    (p) => !productoAgotado(p.stock, stocksVariantesPorProducto.get(p.id) ?? []),
  );

  let productosFiltrados = productosConStock;
  if (tallasSeleccionadas.length > 0 || coloresSeleccionadas.length > 0) {
    const idsConVariante = new Set(
      (variantes ?? [])
        .filter(
          (v) =>
            (tallasSeleccionadas.length === 0 ||
              (v.talla && tallasSeleccionadas.includes(v.talla))) &&
            (coloresSeleccionadas.length === 0 ||
              (v.color && coloresSeleccionadas.includes(v.color))),
        )
        .map((v) => v.product_id),
    );
    productosFiltrados = productosFiltrados.filter((p) => idsConVariante.has(p.id));
  }

  const idsFiltrados = productosFiltrados.map((p) => p.id);
  const [{ data: imagenes }, { data: favoritos }] = await Promise.all([
    idsFiltrados.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", idsFiltrados)
          .eq("is_primary", true)
      : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
    userId && idsFiltrados.length > 0
      ? supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", userId)
          .in("product_id", idsFiltrados)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
  ]);

  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));
  const tallasPorProducto = new Map<string, string[]>();
  for (const variante of variantes ?? []) {
    if (!variante.talla || !idsFiltrados.includes(variante.product_id)) continue;
    const actuales = tallasPorProducto.get(variante.product_id) ?? [];
    if (!actuales.includes(variante.talla)) {
      tallasPorProducto.set(variante.product_id, [...actuales, variante.talla]);
    }
  }
  for (const [productId, tallasProducto] of tallasPorProducto) {
    tallasPorProducto.set(productId, [...tallasProducto].sort());
  }
  const favoritosSet = new Set((favoritos ?? []).map((f) => f.product_id));

  const productos: ProductCardData[] = productosFiltrados.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    promoPrice: p.promo_price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
    tallas: tallasPorProducto.get(p.id) ?? [],
  }));

  return { productos, tallas, colores, favoritosSet };
}
