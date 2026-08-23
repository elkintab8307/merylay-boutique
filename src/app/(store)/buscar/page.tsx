import { createClient } from "@/lib/supabase/server";
import { CatalogFilterSidebar } from "@/components/store/catalog-filter-sidebar";
import { ProductGrid } from "@/components/store/product-grid";
import type { ProductCardData } from "@/components/store/product-card";
import { parseCatalogSearchParams } from "@/lib/store/catalog-search-params";
import { fetchCatalogProducts } from "@/lib/store/fetch-catalog";

export default async function BuscarPage({
  searchParams,
}: PageProps<"/buscar">) {
  const search = await searchParams;
  const {
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    minPrice,
    maxPrice,
    sort,
    q,
    ofertas,
  } = parseCatalogSearchParams(search);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let productos: ProductCardData[] = [];
  let tallas: string[] = [];
  let colores: string[] = [];
  let favoritosSet = new Set<string>();

  if (q) {
    const resultado = await fetchCatalogProducts(supabase, {
      searchQuery: q,
      minPrice,
      maxPrice,
      tallas: tallasSeleccionadas,
      colores: coloresSeleccionadas,
      sort,
      userId: user?.id ?? null,
      soloPromociones: ofertas,
    });
    productos = resultado.productos;
    tallas = resultado.tallas;
    colores = resultado.colores;
    favoritosSet = resultado.favoritosSet;
  }

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">Buscar productos</h1>
      <form method="get" className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar productos"
          className="w-full rounded-md border border-brand-rosa-claro px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-oro"
        />
        <button
          type="submit"
          className="shrink-0 rounded-md bg-brand-rosa px-4 py-2 text-sm text-brand-crema hover:bg-brand-rosa/90"
        >
          Buscar
        </button>
      </form>

      {!q ? (
        <p className="text-brand-ciruela/70">Escribe algo para buscar.</p>
      ) : (
        <div className="flex flex-col gap-8 md:flex-row">
          <CatalogFilterSidebar
            minPrice={minPrice}
            maxPrice={maxPrice}
            tallasSeleccionadas={tallasSeleccionadas}
            coloresSeleccionadas={coloresSeleccionadas}
            tallas={tallas}
            colores={colores}
            sortKey={sort.key}
            ofertas={ofertas}
            q={q}
          />
          <div className="flex-1">
            <ProductGrid
              productos={productos}
              currentUserId={user?.id ?? null}
              favoritosSet={favoritosSet}
              emptyMessage={`No encontramos productos que coincidan con «${q}».`}
            />
          </div>
        </div>
      )}
    </main>
  );
}
