import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";

export default async function ProductosPage() {
  const supabase = await createClient();
  const [{ data: productosBase }, { data: { user } }] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug, price, compare_at_price")
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  const productIds = (productosBase ?? []).map((p) => p.id);

  const [{ data: imagenes }, { data: favoritos }, { data: variantes }] = await Promise.all([
    productIds.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", productIds)
          .eq("is_primary", true)
      : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
    user && productIds.length > 0
      ? supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", user.id)
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
    productIds.length > 0
      ? supabase
          .from("product_variants")
          .select("product_id, talla")
          .in("product_id", productIds)
      : Promise.resolve({ data: [] as { product_id: string; talla: string | null }[] }),
  ]);

  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));
  const favoritosSet = new Set((favoritos ?? []).map((f) => f.product_id));
  const tallasPorProducto = new Map<string, string[]>();
  for (const variante of variantes ?? []) {
    if (!variante.talla) continue;
    const actuales = tallasPorProducto.get(variante.product_id) ?? [];
    if (!actuales.includes(variante.talla)) {
      tallasPorProducto.set(variante.product_id, [...actuales, variante.talla]);
    }
  }
  for (const [productId, tallas] of tallasPorProducto) {
    tallasPorProducto.set(productId, [...tallas].sort());
  }

  const productos: ProductCardData[] = (productosBase ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compare_at_price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
    tallas: tallasPorProducto.get(p.id) ?? [],
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">Todos los productos</h1>
      {productos.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {productos.map((producto) => (
            <ProductCard
              key={producto.slug}
              product={producto}
              currentUserId={user?.id ?? null}
              initialFavorite={favoritosSet.has(producto.id)}
            />
          ))}
        </div>
      ) : (
        <p className="text-brand-ciruela/70">Todavía no hay productos disponibles.</p>
      )}
    </main>
  );
}
