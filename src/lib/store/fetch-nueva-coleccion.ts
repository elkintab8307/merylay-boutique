import type { createClient } from "@/lib/supabase/server";
import { DURACION_NUEVA_COLECCION_DIAS, esNuevaColeccionActiva } from "@/lib/admin/nueva-coleccion";

export type NuevaColeccionItem = {
  variantId: string;
  productSlug: string;
  productName: string;
  price: number;
  promoPrice: number | null;
  imageUrl: string;
};

const MAX_ITEMS_NUEVA_COLECCION = 12;

/**
 * Variantes marcadas "Nueva Coleccion" que siguen activas (dentro de los
 * 5 dias, ver src/lib/admin/nueva-coleccion.ts), de productos activos,
 * y con al menos una foto propia no vendida. Sin esa foto no hay nada
 * que animar en el overlay del home, asi que se descartan.
 */
export async function fetchNuevaColeccion(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<NuevaColeccionItem[]> {
  const cortesIso = new Date(
    Date.now() - DURACION_NUEVA_COLECCION_DIAS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: variantesCandidatas } = await supabase
    .from("product_variants")
    .select("id, product_id, price_override, nueva_coleccion_desde")
    .not("nueva_coleccion_desde", "is", null)
    .gte("nueva_coleccion_desde", cortesIso)
    .order("nueva_coleccion_desde", { ascending: false });

  const variantesActivas = (variantesCandidatas ?? []).filter((v) =>
    esNuevaColeccionActiva(v.nueva_coleccion_desde),
  );
  if (variantesActivas.length === 0) return [];

  const productIds = Array.from(new Set(variantesActivas.map((v) => v.product_id)));
  const { data: productos } = await supabase
    .from("products")
    .select("id, slug, name, price, promo_price, is_active")
    .eq("is_active", true)
    .in("id", productIds);
  const productoPorId = new Map(
    (productos ?? [])
      .filter((p) => p.is_active)
      .map((p) => [p.id, p]),
  );

  const variantIds = variantesActivas.map((v) => v.id);
  const { data: imagenes } = await supabase
    .from("product_images")
    .select("variant_id, url, sort_order, is_primary, vendida")
    .eq("vendida", false)
    .in("variant_id", variantIds);

  const imagenesPorVariante = new Map<
    string,
    { url: string; sortOrder: number; isPrimary: boolean }[]
  >();
  for (const img of imagenes ?? []) {
    if (!img.variant_id) continue;
    if (img.vendida) continue;
    const lista = imagenesPorVariante.get(img.variant_id) ?? [];
    lista.push({ url: img.url, sortOrder: img.sort_order, isPrimary: img.is_primary });
    imagenesPorVariante.set(img.variant_id, lista);
  }

  const items: NuevaColeccionItem[] = [];
  for (const variante of variantesActivas) {
    const producto = productoPorId.get(variante.product_id);
    if (!producto) continue;

    const fotos = imagenesPorVariante.get(variante.id) ?? [];
    if (fotos.length === 0) continue;
    fotos.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.sortOrder - b.sortOrder;
    });

    items.push({
      variantId: variante.id,
      productSlug: producto.slug,
      productName: producto.name,
      price: variante.price_override ?? producto.price,
      promoPrice: producto.promo_price,
      imageUrl: fotos[0].url,
    });
  }

  return items.slice(0, MAX_ITEMS_NUEVA_COLECCION);
}
