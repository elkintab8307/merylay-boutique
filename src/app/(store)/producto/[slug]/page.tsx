import { notFound } from "next/navigation";
import { Truck, ShieldCheck, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ProductGallery } from "./product-gallery";
import { ProductVariantSelector } from "./product-variant-selector";
import { FavoriteButton } from "@/components/store/favorite-button";
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

  const [{ data: imagenes }, { data: variantes }, { data: { user } }] = await Promise.all([
    supabase
      .from("product_images")
      .select("url, alt")
      .eq("product_id", producto.id)
      .order("sort_order"),
    supabase
      .from("product_variants")
      .select("id, talla, color, sku, stock, price_override")
      .eq("product_id", producto.id),
    supabase.auth.getUser(),
  ]);

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
        .select("id, name, slug, price, compare_at_price")
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
          compare_at_price: number | null;
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
    compareAtPrice: p.compare_at_price,
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

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <Breadcrumbs items={breadcrumbItems} />

      <div className="grid gap-10 md:grid-cols-2">
        <ProductGallery images={imagenes ?? []} productName={producto.name} />

        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <h1 className="font-heading text-3xl text-brand-ciruela">{producto.name}</h1>
            <FavoriteButton
              productId={producto.id}
              currentUserId={user?.id ?? null}
              initialFavorite={Boolean(favorito)}
              product={{
                slug: producto.slug,
                name: producto.name,
                price: producto.price,
                imageUrl: imagenPrincipal,
              }}
            />
          </div>
          <div className="flex items-baseline gap-3">
            <span className="font-heading text-2xl text-brand-rosa">
              {formatPrice(producto.price)}
            </span>
            {producto.compare_at_price !== null && producto.compare_at_price > producto.price && (
              <span className="text-brand-ciruela/50 line-through">
                {formatPrice(producto.compare_at_price)}
              </span>
            )}
          </div>
          {producto.description && (
            <p className="text-brand-ciruela/80">{producto.description}</p>
          )}
          <ProductVariantSelector
            productId={producto.id}
            productSlug={producto.slug}
            productName={producto.name}
            imageUrl={imagenPrincipal}
            basePrice={producto.price}
            variants={variantesMapeadas}
            baseStock={producto.stock}
            currentUserId={user?.id ?? null}
          />
          <div className="flex flex-wrap items-center gap-4 border-t border-brand-rosa-claro pt-4 text-xs text-brand-ciruela/70">
            <span className="flex items-center gap-1.5">
              <Truck className="h-4 w-4 text-brand-rosa" />
              Envío a toda Colombia
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-brand-rosa" />
              Pago seguro
            </span>
            <span className="flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4 text-brand-rosa" />
              Cambios y devoluciones
            </span>
          </div>
        </div>
      </div>

      <RelatedProducts
        productos={relacionados}
        currentUserId={user?.id ?? null}
        favoritosSet={favoritosRelacionadosSet}
      />
    </main>
  );
}
