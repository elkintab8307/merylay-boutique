import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";

export default async function HomePage() {
  const supabase = await createClient();

  const { data: destacados } = await supabase
    .from("products")
    .select("id, name, slug, price, compare_at_price")
    .eq("is_active", true)
    .eq("is_featured", true)
    .order("created_at", { ascending: false })
    .limit(8);

  const destacadoIds = (destacados ?? []).map((p) => p.id);
  const { data: imagenesDestacados } =
    destacadoIds.length > 0
      ? await supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", destacadoIds)
          .eq("is_primary", true)
      : { data: [] };

  const imagenPorProducto = new Map(
    (imagenesDestacados ?? []).map((img) => [img.product_id, img.url]),
  );

  const { data: categorias } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("is_active", true)
    .order("sort_order");

  const productosDestacados: ProductCardData[] = (destacados ?? []).map((p) => ({
    slug: p.slug,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compare_at_price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-16 px-6 py-16">
      <section className="flex flex-col items-center gap-6 text-center">
        <p className="font-script text-2xl text-brand-oro">Bienvenida a</p>
        <h1 className="font-heading text-5xl font-semibold text-brand-ciruela">
          MeryLay Boutique
        </h1>
        <p className="max-w-xl font-body text-lg text-brand-ciruela/80">
          Pijamas y ropa femenina pensadas para ti. Elegancia, comodidad y un
          toque romántico en cada prenda.
        </p>
      </section>

      {productosDestacados.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-2xl text-brand-ciruela">Destacados</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
            {productosDestacados.map((producto) => (
              <ProductCard key={producto.slug} product={producto} />
            ))}
          </div>
        </section>
      )}

      {categorias && categorias.length > 0 && (
        <section className="flex flex-col gap-6">
          <h2 className="font-heading text-2xl text-brand-ciruela">Categorías</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {categorias.map((categoria) => (
              <Link
                key={categoria.id}
                href={`/categoria/${categoria.slug}`}
                className="flex items-center justify-center rounded-lg border border-brand-rosa-claro bg-white px-4 py-8 text-center font-heading text-brand-ciruela transition hover:border-brand-rosa"
              >
                {categoria.name}
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
