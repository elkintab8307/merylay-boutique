"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateCartItemQty, removeCartItem, updateCartItemImage } from "./actions";
import { EstampadoPickerModal, type EstampadoOption } from "@/components/store/estampado-picker-modal";

export function CartItemControls({
  cartItemId,
  qty,
  estampadosDisponibles,
  imageId,
}: {
  cartItemId: string;
  qty: number;
  estampadosDisponibles: EstampadoOption[];
  imageId: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [modalAbierto, setModalAbierto] = useState(false);

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

  const handleCambiarEstampado = (imageIds: string[]) => {
    setModalAbierto(false);
    startTransition(async () => {
      await updateCartItemImage(cartItemId, imageIds[0]);
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
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
          disabled={isPending || Boolean(imageId)}
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
      {estampadosDisponibles.length > 1 && (
        <button
          type="button"
          onClick={() => setModalAbierto(true)}
          className="text-xs text-brand-rosa hover:underline"
        >
          Cambiar estampado
        </button>
      )}
      <EstampadoPickerModal
        open={modalAbierto}
        images={estampadosDisponibles}
        seleccionInicial={[]}
        modoUnico
        onClose={() => setModalAbierto(false)}
        onConfirm={handleCambiarEstampado}
      />
    </div>
  );
}
