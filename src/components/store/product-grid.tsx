import { ProductCard, type ProductCardData } from "./product-card";

export function ProductGrid({
  productos,
  currentUserId,
  favoritosSet,
  emptyMessage,
}: {
  productos: ProductCardData[];
  currentUserId: string | null;
  favoritosSet: Set<string>;
  emptyMessage: string;
}) {
  if (productos.length === 0) {
    return <p className="text-brand-ciruela/70">{emptyMessage}</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
      {productos.map((producto) => (
        <ProductCard
          key={producto.slug}
          product={producto}
          currentUserId={currentUserId}
          initialFavorite={favoritosSet.has(producto.id)}
        />
      ))}
    </div>
  );
}
