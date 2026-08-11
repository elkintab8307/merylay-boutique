import Image from "next/image";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { FavoriteItemControls } from "./favorite-item-controls";

export type FavoriteItemView = {
  productId: string;
  name: string;
  slug: string;
  price: number;
  imageUrl: string | null;
};

export function AuthenticatedFavorites({ items }: { items: FavoriteItemView[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-brand-ciruela/70">Aún no tienes productos favoritos.</p>
        <Link href="/">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Ir a la tienda
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-brand-rosa-claro">
      {items.map((item) => (
        <div key={item.productId} className="flex items-center gap-4 py-4">
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro">
            {item.imageUrl && (
              <Image src={item.imageUrl} alt={item.name} fill className="object-cover" />
            )}
          </div>
          <div className="flex-1">
            <Link
              href={`/producto/${item.slug}`}
              className="font-body text-brand-ciruela hover:text-brand-rosa"
            >
              {item.name}
            </Link>
            <p className="text-sm text-brand-rosa">{formatPrice(item.price)}</p>
          </div>
          <FavoriteItemControls productId={item.productId} unitPrice={item.price} />
        </div>
      ))}
    </div>
  );
}
