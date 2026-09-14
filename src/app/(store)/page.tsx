import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";
import { CarruselCategoria } from "@/components/store/carrusel-categoria";
import { productoAgotado } from "@/lib/store/stock";
import { ordenarImagenesTarjeta } from "@/lib/store/ordenar-imagenes-tarjeta";
import { fetchCatalogProducts } from "@/lib/store/fetch-catalog";
import { fetchNuevaColeccion } from "@/lib/store/fetch-nueva-coleccion";
import { HeroSection } from "@/components/store/hero-section";
import { BenefitsBar } from "@/components/store/benefits-bar";
import { FeaturedCategories } from "@/components/store/featured-categories";
import { CollectionBanners } from "@/components/store/collection-banners";
import { ReviewsSection, type ReviewItem } from "@/components/store/reviews-section";
import { NuevaColeccionOverlay } from "@/components/store/nueva-coleccion-overlay";
import { parseHeroStored, bannersStoredSchema } from "@/lib/validation/home-contenido";

const PRODUCTOS_POR_CARRUSEL_CATEGORIA = 10;

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
      .select("id, name, slug, price, promo_price, stock")
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
      .select("id, name, slug, price, promo_price, stock")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(8);
    productosBase = recientes ?? [];
  }

  const idsBase = productosBase.map((p) => p.id);
  const { data: variantesBase } =
    idsBase.length > 0
      ? await supabase
          .from("product_variants")
          .select("product_id, talla, stock")
          .in("product_id", idsBase)
      : { data: [] as { product_id: string; talla: string | null; stock: number }[] };

  const stocksVariantesPorProducto = new Map<string, number[]>();
  for (const v of variantesBase ?? []) {
    const actuales = stocksVariantesPorProducto.get(v.product_id) ?? [];
    actuales.push(v.stock);
    stocksVariantesPorProducto.set(v.product_id, actuales);
  }
  productosBase = productosBase.filter(
    (p) => !productoAgotado(p.stock, stocksVariantesPorProducto.get(p.id) ?? []),
  );

  const productoIds = productosBase.map((p) => p.id);

  const [{ data: imagenes }, { data: favoritos }] = await Promise.all([
    productoIds.length > 0
      ? supabase
          .from("product_images")
          .select("product_id, url, sort_order, is_primary, vendida")
          .in("product_id", productoIds)
      : Promise.resolve({
          data: [] as {
            product_id: string;
            url: string;
            sort_order: number;
            is_primary: boolean;
            vendida: boolean;
          }[],
        }),
    user && productoIds.length > 0
      ? supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", user.id)
          .in("product_id", productoIds)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
  ]);

  const imagenesPorProducto = new Map<
    string,
    { url: string; sortOrder: number; isPrimary: boolean; vendida: boolean }[]
  >();
  for (const img of imagenes ?? []) {
    const lista = imagenesPorProducto.get(img.product_id) ?? [];
    lista.push({
      url: img.url,
      sortOrder: img.sort_order,
      isPrimary: img.is_primary,
      vendida: img.vendida,
    });
    imagenesPorProducto.set(img.product_id, lista);
  }
  const favoritosSet = new Set((favoritos ?? []).map((f) => f.product_id));

  const tallasPorProducto = new Map<string, string[]>();
  for (const variante of variantesBase ?? []) {
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
    imageUrls: ordenarImagenesTarjeta(imagenesPorProducto.get(p.id) ?? []),
    tallas: tallasPorProducto.get(p.id) ?? [],
  }));

  const carruselesCategoria = (
    await Promise.all(
      (categorias ?? []).map(async (categoria) => {
        const resultado = await fetchCatalogProducts(supabase, {
          categoryId: categoria.id,
          tallas: [],
          colores: [],
          sort: { key: "recientes", column: "created_at", ascending: false },
          userId: user?.id ?? null,
          limit: PRODUCTOS_POR_CARRUSEL_CATEGORIA,
        });
        return {
          id: categoria.id,
          titulo: categoria.name,
          verTodosHref: `/categoria/${categoria.slug}`,
          productos: resultado.productos,
          favoritosSet: resultado.favoritosSet,
        };
      }),
    )
  ).filter((c) => c.productos.length > 0);

  const nuevaColeccionItems = await fetchNuevaColeccion(supabase);

  const settingsByKey = new Map((settingsRows ?? []).map((r) => [r.key, r.value]));
  const hero = parseHeroStored(settingsByKey.get("home_hero"));
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
      <HeroSection hero={hero} />
      <NuevaColeccionOverlay items={nuevaColeccionItems} />
      <BenefitsBar />
      <FeaturedCategories
        categorias={(categorias ?? [])
          .filter((c) => c.is_featured)
          .map((c) => ({ id: c.id, name: c.name, slug: c.slug, imageUrl: c.image_url }))}
      />
      {carruselesCategoria.map((carrusel) => (
        <CarruselCategoria
          key={carrusel.id}
          titulo={carrusel.titulo}
          verTodosHref={carrusel.verTodosHref}
          productos={carrusel.productos}
          currentUserId={user?.id ?? null}
          favoritosSet={carrusel.favoritosSet}
        />
      ))}

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

      <CollectionBanners banners={banners} />

      <ReviewsSection resenas={resenas} />
    </main>
  );
}
