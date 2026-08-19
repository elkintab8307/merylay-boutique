import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";
import { HeroSection } from "@/components/store/hero-section";
import { BenefitsBar } from "@/components/store/benefits-bar";
import { FeaturedCategories } from "@/components/store/featured-categories";
import { CollectionBanners } from "@/components/store/collection-banners";
import { ReviewsSection, type ReviewItem } from "@/components/store/reviews-section";
import { heroStoredSchema, bannersStoredSchema } from "@/lib/validation/home-contenido";

export default async function HomePage() {
  const supabase = await createClient();

  const [
    { data: destacados },
    { data: { user } },
    { data: categorias },
    { data: settingsRows },
    { data: resenasData },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, slug, price, promo_price")
      .eq("is_active", true)
      .eq("is_featured", true)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase.auth.getUser(),
    supabase
      .from("categories")
      .select("id, name, slug, image_url, is_featured")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("store_settings")
      .select("key, value")
      .in("key", ["home_hero", "home_banners"]),
    supabase
      .from("reviews")
      .select("id, customer_name, body, rating, image_url")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(6),
  ]);

  let productosBase = destacados ?? [];
  if (productosBase.length === 0) {
    const { data: recientes } = await supabase
      .from("products")
      .select("id, name, slug, price, promo_price")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(8);
    productosBase = recientes ?? [];
  }

  const productoIds = productosBase.map((p) => p.id);

  const [{ data: imagenes }, { data: favoritos }, { data: variantes }] = await Promise.all([
    productoIds.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", productoIds)
          .eq("is_primary", true)
      : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
    user && productoIds.length > 0
      ? supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", user.id)
          .in("product_id", productoIds)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
    productoIds.length > 0
      ? supabase
          .from("product_variants")
          .select("product_id, talla")
          .in("product_id", productoIds)
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

  const productos: ProductCardData[] = productosBase.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    promoPrice: p.promo_price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
    tallas: tallasPorProducto.get(p.id) ?? [],
  }));

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const heroParsed = heroStoredSchema.safeParse(settingsByKey.get("home_hero"));
  const hero = heroParsed.success ? heroParsed.data : null;
  const bannersParsed = bannersStoredSchema.safeParse(settingsByKey.get("home_banners"));
  const banners = bannersParsed.success ? bannersParsed.data : [];

  const resenas: ReviewItem[] = (resenasData ?? []).map((r) => ({
    id: r.id,
    customerName: r.customer_name,
    body: r.body,
    rating: r.rating,
    imageUrl: r.image_url,
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-10">
      <HeroSection hero={hero} primerCategoriaSlug={categorias?.[0]?.slug ?? null} />
      <BenefitsBar />
      <FeaturedCategories
        categorias={(categorias ?? [])
          .filter((c) => c.is_featured)
          .map((c) => ({ id: c.id, name: c.name, slug: c.slug, imageUrl: c.image_url }))}
      />
      <CollectionBanners banners={banners} />

      {productos.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-2xl text-brand-ciruela">Destacados</h2>
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
        </section>
      )}

      <ReviewsSection resenas={resenas} />
    </main>
  );
}
