"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCartItemQty, removeCartItem } from "./actions";

export function CartItemControls({ cartItemId, qty }: { cartItemId: string; qty: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleUpdate = (nextQty: number) => {
    startTransition(async () => {
      await updateCartItemQty(cartItemId, nextQty);
      router.refresh();
    });
  };

  const handleRemove = () => {
    startTransition(async () => {
      await removeCartItem(cartItemId);
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleUpdate(qty - 1)}
        className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
      >
        -
      </button>
      <span className="w-6 text-center text-sm text-brand-ciruela">{qty}</span>
      <button
        type="button"
        disabled={isPending}
        onClick={() => handleUpdate(qty + 1)}
        className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
      >
        +
      </button>
      <button
        type="button"
        disabled={isPending}
        onClick={handleRemove}
        className="ml-2 text-sm text-red-600 hover:underline"
      >
        Quitar
      </button>
    </div>
  );
}
