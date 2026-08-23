import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Breadcrumbs } from "@/components/store/breadcrumbs";
import { CategoryBanner } from "@/components/store/category-banner";
import { CatalogFilterSidebar } from "@/components/store/catalog-filter-sidebar";
import { ProductGrid } from "@/components/store/product-grid";
import { parseCatalogSearchParams } from "@/lib/store/catalog-search-params";
import { fetchCatalogProducts } from "@/lib/store/fetch-catalog";

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

  const {
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    minPrice,
    maxPrice,
    sort,
    ofertas,
  } = parseCatalogSearchParams(search);

  const { productos, tallas, colores, favoritosSet } = await fetchCatalogProducts(supabase, {
    categoryId: categoria.id,
    minPrice,
    maxPrice,
    tallas: tallasSeleccionadas,
    colores: coloresSeleccionadas,
    sort,
    userId: user?.id ?? null,
    soloPromociones: ofertas,
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <Breadcrumbs items={[{ label: "Inicio", href: "/" }, { label: categoria.name }]} />
      <CategoryBanner imageUrl={categoria.image_url} />
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold text-brand-ciruela sm:text-4xl">
          {categoria.name}
        </h1>
        {categoria.description && (
          <p className="max-w-xl text-sm text-brand-ciruela/80 sm:text-base">
            {categoria.description}
          </p>
        )}
      </div>

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
        />
        <div className="flex-1">
          <ProductGrid
            productos={productos}
            currentUserId={user?.id ?? null}
            favoritosSet={favoritosSet}
            emptyMessage="No hay productos que coincidan con los filtros seleccionados."
          />
        </div>
      </div>
    </main>
  );
}
