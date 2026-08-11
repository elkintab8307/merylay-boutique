"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeFavorite } from "./actions";
import { addToCart } from "@/app/(store)/carrito/actions";

export function FavoriteItemControls({
  productId,
  unitPrice,
}: {
  productId: string;
  unitPrice: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleAddToCart = () => {
    startTransition(async () => {
      await addToCart(productId, null, 1, unitPrice);
      router.refresh();
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      await removeFavorite(productId);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={handleAddToCart}
        className="rounded-md border border-brand-rosa px-3 py-1.5 text-sm text-brand-rosa hover:bg-brand-rosa/10"
      >
        Agregar al carrito
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleRemove}
        className="text-sm text-red-600 hover:underline"
      >
        Quitar
      </button>
    </div>
  );
}
