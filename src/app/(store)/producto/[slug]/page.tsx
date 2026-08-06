import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ProductGallery } from "./product-gallery";
import { ProductVariantSelector } from "./product-variant-selector";

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

  const [{ data: imagenes }, { data: variantes }] = await Promise.all([
    supabase
      .from("product_images")
      .select("url, alt")
      .eq("product_id", producto.id)
      .order("sort_order"),
    supabase
      .from("product_variants")
      .select("talla, color, sku, stock, price_override")
      .eq("product_id", producto.id),
  ]);

  const variantesMapeadas = (variantes ?? []).map((v) => ({
    talla: v.talla,
    color: v.color,
    sku: v.sku,
    stock: v.stock,
    priceOverride: v.price_override,
  }));

  return (
    <main className="mx-auto grid max-w-5xl gap-10 px-6 py-12 md:grid-cols-2">
      <ProductGallery images={imagenes ?? []} productName={producto.name} />

      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-3xl text-brand-ciruela">{producto.name}</h1>
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
        <ProductVariantSelector variants={variantesMapeadas} baseStock={producto.stock} />
      </div>
    </main>
  );
}
