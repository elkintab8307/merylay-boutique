"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeFavorite } from "./actions";
import { addToCart } from "@/app/(store)/carrito/actions";

export function FavoriteItemControls({
  productId,
  slug,
  unitPrice,
  hasVariants,
}: {
  productId: string;
  slug: string;
  unitPrice: number;
  hasVariants: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const handleAddToCart = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await addToCart(productId, null, 1, unitPrice);
      setMessage(result?.error ?? "Agregado al carrito.");
      router.refresh();
    });
  };

  const handleRemove = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await removeFavorite(productId);
      if (result?.error) {
        setMessage(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        {hasVariants ? (
          <Link
            href={`/producto/${slug}`}
            className="rounded-md border border-brand-rosa px-3 py-1.5 text-sm text-brand-rosa hover:bg-brand-rosa/10"
          >
            Ver producto
          </Link>
        ) : (
          <button
            type="button"
            disabled={isPending}
            onClick={handleAddToCart}
            className="rounded-md border border-brand-rosa px-3 py-1.5 text-sm text-brand-rosa hover:bg-brand-rosa/10"
          >
            Agregar al carrito
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={handleRemove}
          className="text-sm text-red-600 hover:underline"
        >
          Quitar
        </button>
      </div>
      {message && <p className="text-xs text-brand-oro">{message}</p>}
    </div>
  );
}
