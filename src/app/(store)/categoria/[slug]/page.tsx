import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CategoryBanner } from "@/components/store/category-banner";
import { getVariantOptions } from "@/lib/store/variants";
import { resolveSort } from "@/lib/store/sort";

function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function firstValue(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

export default async function CategoriaPage({
  params,
  searchParams,
}: PageProps<"/categoria/[slug]">) {
  const { slug } = await params;
  const search = await searchParams;

  const supabase = await createClient();

  const [{ data: categoria }, { data: { user } }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, slug, image_url, description")
      .eq("slug", slug)
      .eq("is_active", true)
      .single(),
    supabase.auth.getUser(),
  ]);

  if (!categoria) {
    notFound();
  }

  const tallasSeleccionadas = toArray(search.talla);
  const coloresSeleccionados = toArray(search.color);
  const minPriceStr = firstValue(search.minPrice);
  const maxPriceStr = firstValue(search.maxPrice);
  const minPrice = minPriceStr ? Number(minPriceStr) : undefined;
  const maxPrice = maxPriceStr ? Number(maxPriceStr) : undefined;
  const sort = resolveSort(firstValue(search.sort));

  let query = supabase
    .from("products")
    .select("id, name, slug, price, compare_at_price")
    .eq("category_id", categoria.id)
    .eq("is_active", true);

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

  const productIds = (productosBase ?? []).map((p) => p.id);
  const { data: variantesCategoria } =
    productIds.length > 0
      ? await supabase
          .from("product_variants")
          .select("product_id, talla, color")
          .in("product_id", productIds)
      : { data: [] };

  const { tallas, colores } = getVariantOptions(
    (variantesCategoria ?? []).map((v) => ({
      id: "",
      talla: v.talla,
      color: v.color,
      sku: "",
      stock: 0,
      priceOverride: null,
    })),
  );

  let productosFiltrados = productosBase ?? [];
  if (tallasSeleccionadas.length > 0 || coloresSeleccionados.length > 0) {
    const idsConVariante = new Set(
      (variantesCategoria ?? [])
        .filter(
          (v) =>
            (tallasSeleccionadas.length === 0 ||
              (v.talla && tallasSeleccionadas.includes(v.talla))) &&
            (coloresSeleccionados.length === 0 ||
              (v.color && coloresSeleccionados.includes(v.color))),
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
    user && idsFiltrados.length > 0
      ? supabase
          .from("favorites")
          .select("product_id")
          .eq("user_id", user.id)
          .in("product_id", idsFiltrados)
      : Promise.resolve({ data: [] as { product_id: string }[] }),
  ]);
  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));
  const tallasPorProducto = new Map<string, string[]>();
  for (const variante of variantesCategoria ?? []) {
    if (!variante.talla || !idsFiltrados.includes(variante.product_id)) continue;
    const actuales = tallasPorProducto.get(variante.product_id) ?? [];
    if (!actuales.includes(variante.talla)) {
      tallasPorProducto.set(variante.product_id, [...actuales, variante.talla]);
    }
  }
  for (const [productId, tallas] of tallasPorProducto) {
    tallasPorProducto.set(productId, [...tallas].sort());
  }
  const favoritosSet = new Set((favoritos ?? []).map((f) => f.product_id));

  const productos: ProductCardData[] = productosFiltrados.map((p) => ({
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
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: categoria.name }]} />
      <CategoryBanner
        name={categoria.name}
        description={categoria.description}
        imageUrl={categoria.image_url}
      />

      <div className="flex flex-col gap-8 md:flex-row">
        <aside className="w-full shrink-0 md:w-56">
          <form method="get" className="flex flex-col gap-6">
            <div>
              <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Precio</h2>
              <div className="flex gap-2">
                <input
                  type="number"
                  name="minPrice"
                  placeholder="Mín"
                  defaultValue={minPriceStr}
                  className="w-1/2 rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
                />
                <input
                  type="number"
                  name="maxPrice"
                  placeholder="Máx"
                  defaultValue={maxPriceStr}
                  className="w-1/2 rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
                />
              </div>
            </div>

            {tallas.length > 0 && (
              <div>
                <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Talla</h2>
                <div className="flex flex-wrap gap-2">
                  {tallas.map((talla) => (
                    <label
                      key={talla}
                      className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-brand-rosa-claro px-3 py-1 text-sm text-brand-ciruela has-[:checked]:border-brand-rosa has-[:checked]:bg-brand-rosa has-[:checked]:text-brand-crema has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-oro has-[:focus-visible]:ring-offset-2"
                    >
                      <input
                        type="checkbox"
                        name="talla"
                        value={talla}
                        defaultChecked={tallasSeleccionadas.includes(talla)}
                        className="sr-only"
                      />
                      {talla}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {colores.length > 0 && (
              <div>
                <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Color</h2>
                <div className="flex flex-wrap gap-2">
                  {colores.map((color) => (
                    <label
                      key={color}
                      className="flex w-fit cursor-pointer items-center gap-2 rounded-full border border-brand-rosa-claro px-3 py-1 text-sm text-brand-ciruela has-[:checked]:border-brand-rosa has-[:checked]:bg-brand-rosa has-[:checked]:text-brand-crema has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-oro has-[:focus-visible]:ring-offset-2"
                    >
                      <input
                        type="checkbox"
                        name="color"
                        value={color}
                        defaultChecked={coloresSeleccionados.includes(color)}
                        className="sr-only"
                      />
                      {color}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div>
              <h2 className="mb-2 font-heading text-sm text-brand-ciruela">Ordenar por</h2>
              <select
                name="sort"
                defaultValue={sort.key}
                className="w-full rounded-md border border-brand-rosa-claro px-2 py-1 text-sm"
              >
                <option value="destacados">Destacados</option>
                <option value="precio-asc">Precio: menor a mayor</option>
                <option value="precio-desc">Precio: mayor a menor</option>
                <option value="recientes">Más reciente</option>
              </select>
            </div>

            <button
              type="submit"
              className="rounded-md bg-brand-rosa px-4 py-2 text-sm text-brand-crema hover:bg-brand-rosa/90"
            >
              Aplicar filtros
            </button>
          </form>
        </aside>

        <div className="flex-1">
          {productos.length > 0 ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
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
            <p className="text-brand-ciruela/70">
              No hay productos que coincidan con los filtros seleccionados.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
