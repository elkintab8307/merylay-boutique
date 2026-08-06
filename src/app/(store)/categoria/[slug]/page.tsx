import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";
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

  const { data: categoria } = await supabase
    .from("categories")
    .select("id, name, slug")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

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
  const { data: imagenes } =
    idsFiltrados.length > 0
      ? await supabase
          .from("product_images")
          .select("product_id, url")
          .in("product_id", idsFiltrados)
          .eq("is_primary", true)
      : { data: [] };
  const imagenPorProducto = new Map((imagenes ?? []).map((img) => [img.product_id, img.url]));

  const productos: ProductCardData[] = productosFiltrados.map((p) => ({
    slug: p.slug,
    name: p.name,
    price: p.price,
    compareAtPrice: p.compare_at_price,
    imageUrl: imagenPorProducto.get(p.id) ?? null,
  }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">{categoria.name}</h1>

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
                <div className="flex flex-col gap-1">
                  {tallas.map((talla) => (
                    <label
                      key={talla}
                      className="flex items-center gap-2 text-sm text-brand-ciruela"
                    >
                      <input
                        type="checkbox"
                        name="talla"
                        value={talla}
                        defaultChecked={tallasSeleccionadas.includes(talla)}
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
                <div className="flex flex-col gap-1">
                  {colores.map((color) => (
                    <label
                      key={color}
                      className="flex items-center gap-2 text-sm text-brand-ciruela"
                    >
                      <input
                        type="checkbox"
                        name="color"
                        value={color}
                        defaultChecked={coloresSeleccionados.includes(color)}
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
                <ProductCard key={producto.slug} product={producto} />
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
