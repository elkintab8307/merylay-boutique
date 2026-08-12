import { ProductCard, type ProductCardData } from "@/components/store/product-card";

export function RelatedProducts({
  productos,
  currentUserId,
  favoritosSet,
}: {
  productos: ProductCardData[];
  currentUserId: string | null;
  favoritosSet: Set<string>;
}) {
  if (productos.length === 0) return null;

  return (
    <section className="flex flex-col gap-6">
      <h2 className="font-heading text-2xl text-brand-ciruela">También te puede gustar</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {productos.map((producto) => (
          <ProductCard
            key={producto.slug}
            product={producto}
            currentUserId={currentUserId}
            initialFavorite={favoritosSet.has(producto.id)}
          />
        ))}
      </div>
    </section>
  );
}
