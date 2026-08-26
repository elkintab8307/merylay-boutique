import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductDetailInteractive } from "./product-detail-interactive";
import { ProductRatingsSection, type CalificacionItem } from "./product-ratings-section";
import type { ImagenProducto } from "@/lib/store/variant-images";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/store/breadcrumbs";
import { RelatedProducts } from "@/components/store/related-products";
import type { ProductCardData } from "@/components/store/product-card";

export default async function ProductoPage({
  params,
}: PageProps<"/producto/[slug]">) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: producto } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (!producto) {
    notFound();
  }

  const [
    { data: imagenes },
    { data: variantes },
    {
      data: { user },
    },
    { data: calificacionesBase },
    { data: whatsappSetting },
  ] = await Promise.all([
    supabase
      .from("product_images")
      .select("id, url, alt, variant_id")
      .eq("product_id", producto.id)
      .order("sort_order"),
    supabase
      .from("product_variants")
      .select("id, talla, color, sku, stock, price_override")
      .eq("product_id", producto.id),
    supabase.auth.getUser(),
    supabase
      .from("product_ratings")
      .select("id, rating, comment, author_name, user_id")
      .eq("product_id", producto.id)
      .order("created_at", { ascending: false }),
    supabase.from("store_settings").select("value").eq("key", "redes_whatsapp").maybeSingle(),
  ]);

  const redesWhatsapp = whatsappSetting?.value ? String(whatsappSetting.value) : null;

  const calificaciones: CalificacionItem[] = (calificacionesBase ?? []).map((c) => ({
    id: c.id,
    rating: c.rating,
    comment: c.comment,
    autorNombre: c.author_name,
  }));
  const totalCalificaciones = calificaciones.length;
  const promedioCalificacion =
    totalCalificaciones > 0
      ? calificaciones.reduce((sum, c) => sum + c.rating, 0) / totalCalificaciones
      : 0;
  const calificacionPropiaBase = user
    ? (calificacionesBase ?? []).find((c) => c.user_id === user.id)
    : null;
  const calificacionPropia = calificacionPropiaBase
    ? { rating: calificacionPropiaBase.rating, comment: calificacionPropiaBase.comment ?? "" }
    : null;

  const { data: favorito } = user
    ? await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_id", producto.id)
        .maybeSingle()
    : { data: null };

  const { data: categoriaProducto } = producto.category_id
    ? await supabase
        .from("categories")
        .select("name, slug")
        .eq("id", producto.category_id)
        .maybeSingle()
    : { data: null };

  const breadcrumbItems: BreadcrumbItem[] = [
    { label: "Inicio", href: "/" },
    ...(categoriaProducto
      ? [{ label: categoriaProducto.name, href: `/categoria/${categoriaProducto.slug}` }]
      : []),
    { label: producto.name },
  ];

  const { data: relacionadosBase } = producto.category_id
    ? await supabase
        .from("products")
        .select("id, name, slug, price, promo_price")
        .eq("category_id", producto.category_id)
        .eq("is_active", true)
        .neq("id", producto.id)
        .order("created_at", { ascending: false })
        .limit(4)
    : {
        data: [] as {
          id: string;
          name: string;
          slug: string;
          price: number;
          promo_price: number | null;
        }[],
      };

  const relacionadosIds = (relacionadosBase ?? []).map((p) => p.id);

  const [{ data: imagenesRelacionados }, { data: favoritosRelacionados }, { data: variantesRelacionados }] =
    await Promise.all([
      relacionadosIds.length > 0
        ? supabase
            .from("product_images")
            .select("product_id, url")
            .in("product_id", relacionadosIds)
            .eq("is_primary", true)
        : Promise.resolve({ data: [] as { product_id: string; url: string }[] }),
      user && relacionadosIds.length > 0
        ? supabase
            .from("favorites")
            .select("product_id")
            .eq("user_id", user.id)
            .in("product_id", relacionadosIds)
        : Promise.resolve({ data: [] as { product_id: string }[] }),
      relacionadosIds.length > 0
        ? supabase
            .from("product_variants")
            .select("product_id, talla")
            .in("product_id", relacionadosIds)
        : Promise.resolve({ data: [] as { product_id: string; talla: string | null }[] }),
    ]);

  const imagenPorRelacionado = new Map(
    (imagenesRelacionados ?? []).map((img) => [img.product_id, img.url]),
  );
  const favoritosRelacionadosSet = new Set(
    (favoritosRelacionados ?? []).map((f) => f.product_id),
  );
  const tallasPorRelacionado = new Map<string, string[]>();
  for (const variante of variantesRelacionados ?? []) {
    if (!variante.talla) continue;
    const actuales = tallasPorRelacionado.get(variante.product_id) ?? [];
    if (!actuales.includes(variante.talla)) {
      tallasPorRelacionado.set(variante.product_id, [...actuales, variante.talla]);
    }
  }
  for (const [productId, tallas] of tallasPorRelacionado) {
    tallasPorRelacionado.set(productId, [...tallas].sort());
  }

  const relacionados: ProductCardData[] = (relacionadosBase ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    price: p.price,
    promoPrice: p.promo_price,
    imageUrl: imagenPorRelacionado.get(p.id) ?? null,
    tallas: tallasPorRelacionado.get(p.id) ?? [],
  }));

  const variantesMapeadas = (variantes ?? []).map((v) => ({
    id: v.id,
    talla: v.talla,
    color: v.color,
    sku: v.sku,
    stock: v.stock,
    priceOverride: v.price_override,
  }));

  const imagenPrincipal = imagenes && imagenes.length > 0 ? imagenes[0].url : null;

  const imagenesGaleria: ImagenProducto[] = (imagenes ?? []).map((img) => ({
    id: img.id,
    url: img.url,
    alt: img.alt,
    variantId: img.variant_id,
  }));

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <Breadcrumbs items={breadcrumbItems} />

      <ProductDetailInteractive
        productId={producto.id}
        productSlug={producto.slug}
        productName={producto.name}
        description={producto.description}
        price={producto.price}
        promoPrice={producto.promo_price}
        images={imagenesGaleria}
        variants={variantesMapeadas}
        baseStock={producto.stock}
        currentUserId={user?.id ?? null}
        initialFavorite={Boolean(favorito)}
        imagenPrincipal={imagenPrincipal}
        promedioCalificacion={promedioCalificacion}
        totalCalificaciones={totalCalificaciones}
        redesWhatsapp={redesWhatsapp}
      />

      <ProductRatingsSection
        productId={producto.id}
        productSlug={producto.slug}
        calificaciones={calificaciones}
        estaAutenticado={Boolean(user)}
        calificacionPropia={calificacionPropia}
      />

      <RelatedProducts
        productos={relacionados}
        currentUserId={user?.id ?? null}
        favoritosSet={favoritosRelacionadosSet}
      />
    </main>
  );
}
