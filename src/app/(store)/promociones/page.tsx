import { createClient } from "@/lib/supabase/server";
import { ProductGrid } from "@/components/store/product-grid";
import { resolveSort } from "@/lib/store/sort";
import { fetchCatalogProducts } from "@/lib/store/fetch-catalog";

export default async function PromocionesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { productos, favoritosSet } = await fetchCatalogProducts(supabase, {
    tallas: [],
    colores: [],
    sort: resolveSort(undefined),
    userId: user?.id ?? null,
    soloPromociones: true,
  });

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-12">
      <h1 className="font-heading text-3xl text-brand-ciruela">Promociones</h1>
      <ProductGrid
        productos={productos}
        currentUserId={user?.id ?? null}
        favoritosSet={favoritosSet}
        emptyMessage="Todavía no hay productos en promoción."
      />
    </main>
  );
}
