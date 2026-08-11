import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ProductGallery } from "./product-gallery";
import { ProductVariantSelector } from "./product-variant-selector";
import { FavoriteButton } from "@/components/store/favorite-button";

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
    <main className="mx-auto grid max-w-5xl gap-10 px-6 py-12 md:grid-cols-2">
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
          {producto.compare_at_price && producto.compare_at_price > producto.price && (
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
      </div>
    </main>
  );
}
