import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { calcularDescuento, precioEfectivo } from "@/lib/store/discount";
import { FavoriteButton } from "@/components/store/favorite-button";
import { TarjetaGaleria } from "@/components/store/tarjeta-galeria";

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  price: number;
  promoPrice: number | null;
  imageUrls: string[];
  tallas: string[];
};

export function ProductCard({
  product,
  currentUserId,
  initialFavorite,
}: {
  product: ProductCardData;
  currentUserId: string | null;
  initialFavorite: boolean;
}) {
  const descuento = calcularDescuento(product.price, product.promoPrice);
  const precioMostrado = precioEfectivo(product.price, product.promoPrice);

  return (
    <Link
      href={`/producto/${product.slug}`}
      className="flex flex-col gap-1.5 rounded-lg border border-brand-rosa-claro bg-white p-2 shadow-brand-sm transition hover:shadow-brand-md sm:gap-2 sm:p-3"
    >
      {/* En movil, aspect-[3/4] (vertical) en vez de cuadrado: las fotos de
          producto son naturalmente verticales (fotografia de moda), asi que
          un cuadro cuadrado con object-contain las deja con bandas vacias a
          los lados y el estampado se ve chico. Un cuadro con forma parecida
          a la foto real llena mucho mas del espacio, sin recortar nada.
          Desde `sm:` (tablet/escritorio) vuelve a cuadrado, sin cambios. */}
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-brand-rosa-claro sm:aspect-square">
        <TarjetaGaleria images={product.imageUrls} alt={product.name} />
        {descuento !== null && (
          <span className="absolute left-2 top-2 rounded-full bg-brand-rosa px-2 py-0.5 text-xs font-semibold text-brand-crema">
            -{descuento}%
          </span>
        )}
        <div className="absolute right-2 top-2">
          <FavoriteButton
            productId={product.id}
            currentUserId={currentUserId}
            initialFavorite={initialFavorite}
            product={{
              slug: product.slug,
              name: product.name,
              price: precioMostrado,
              imageUrl: product.imageUrls[0] ?? null,
            }}
          />
        </div>
      </div>
      <span className="font-body text-sm text-brand-ciruela">{product.name}</span>
      {product.tallas.length > 0 && (
        <span className="text-xs text-brand-ciruela/60">
          {product.tallas.length > 1 ? "Tallas: " : "Talla: "}
          {product.tallas.join(" · ")}
        </span>
      )}
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-brand-rosa">{formatPrice(precioMostrado)}</span>
        {descuento !== null && (
          <span className="text-xs text-brand-ciruela/50 line-through">
            {formatPrice(product.price)}
          </span>
        )}
      </div>
    </Link>
  );
}
