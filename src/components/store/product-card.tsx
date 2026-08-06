import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

export type ProductCardData = {
  slug: string;
  name: string;
  price: number;
  compareAtPrice: number | null;
  imageUrl: string | null;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  return (
    <Link
      href={`/producto/${product.slug}`}
      className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-3 transition hover:shadow-md"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-brand-rosa-claro">
        {product.imageUrl ? (
          <Image
            src={product.imageUrl}
            alt={product.name}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-brand-ciruela/50">
            Sin imagen
          </div>
        )}
      </div>
      <span className="font-body text-sm text-brand-ciruela">{product.name}</span>
      <div className="flex items-baseline gap-2">
        <span className="font-heading text-brand-rosa">{formatPrice(product.price)}</span>
        {product.compareAtPrice && product.compareAtPrice > product.price && (
          <span className="text-xs text-brand-ciruela/50 line-through">
            {formatPrice(product.compareAtPrice)}
          </span>
        )}
      </div>
    </Link>
  );
}
