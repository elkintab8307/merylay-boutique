import { createClient } from "@/lib/supabase/server";
import { CatalogFilterSidebar } from "@/components/store/catalog-filter-sidebar";
import { ProductGrid } from "@/components/store/product-grid";
import { parseCatalogSearchParams } from "@/lib/store/catalog-search-params";
import { fetchCatalogProducts } from "@/lib/store/fetch-catalog";

export default async function ProductosPage({
  searchParams,
}: PageProps<"/productos">) {
  const search = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    minPrice,
    maxPrice,
    sort,
  } = parseCatalogSearchParams(search);

  const { productos, tallas, colores, favoritosSet } = await fetchCatalogProducts(supabase, {
    minPrice,
    maxPrice,
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    sort,
    userId: user?.id ?? null,
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">Todos los productos</h1>
      <div className="flex flex-col gap-8 md:flex-row">
        <CatalogFilterSidebar
          minPrice={minPrice}
          maxPrice={maxPrice}
          tallasSeleccionadas={tallasSeleccionadas}
          coloresSeleccionadas={coloresSeleccionadas}
          tallas={tallas}
          colores={colores}
          sortKey={sort.key}
        />
        <div className="flex-1">
          <ProductGrid
            productos={productos}
            currentUserId={user?.id ?? null}
            favoritosSet={favoritosSet}
            emptyMessage="Todavía no hay productos disponibles."
          />
        </div>
      </div>
    </main>
  );
}
