import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { calcularDescuento, precioEfectivo } from "@/lib/store/discount";
import { FavoriteButton } from "@/components/store/favorite-button";

export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  price: number;
  promoPrice: number | null;
  imageUrl: string | null;
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
      className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-3 shadow-brand-sm transition hover:shadow-brand-md"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-brand-rosa-claro">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-brand-ciruela/50">
            Sin imagen
          </div>
        )}
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
              imageUrl: product.imageUrl,
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
