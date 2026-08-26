"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  getLocalCart,
  saveLocalCart,
  updateItemQty,
  removeItem,
  computeSubtotal,
  type LocalCartItem,
} from "@/lib/cart/local-cart";
import { EstampadoPickerModal, type EstampadoOption } from "@/components/store/estampado-picker-modal";

export function GuestCart() {
  const [items, setItems] = useState<LocalCartItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [lineaEditando, setLineaEditando] = useState<{
    productId: string;
    variantId: string | null;
    imageId: string | null;
    estampados: EstampadoOption[];
  } | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(getLocalCart());
    setLoaded(true);
  }, []);

  const handleUpdate = (
    productId: string,
    variantId: string | null,
    imageId: string | null,
    qty: number,
  ) => {
    const next = updateItemQty(items, productId, variantId, imageId, qty);
    setItems(next);
    saveLocalCart(next);
  };

  const handleRemove = (productId: string, variantId: string | null, imageId: string | null) => {
    const next = removeItem(items, productId, variantId, imageId);
    setItems(next);
    saveLocalCart(next);
  };

  const handleCambiarEstampado = (nuevoImageId: string) => {
    if (!lineaEditando) return;
    const nuevaImagen = lineaEditando.estampados.find((e) => e.imageId === nuevoImageId);
    const next = items.map((item) =>
      item.productId === lineaEditando.productId &&
      item.variantId === lineaEditando.variantId &&
      item.imageId === lineaEditando.imageId
        ? { ...item, imageId: nuevoImageId, imageUrl: nuevaImagen?.url ?? item.imageUrl }
        : item,
    );
    setItems(next);
    saveLocalCart(next);
    setLineaEditando(null);
  };

  if (!loaded) return null;

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-brand-ciruela/70">Tu carrito está vacío.</p>
        <Link href="/">
          <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
            Ir a la tienda
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col divide-y divide-brand-rosa-claro">
        {items.map((item) => (
          <div
            key={`${item.productId}-${item.variantId ?? "base"}-${item.imageId ?? "sin-estampado"}`}
            className="flex items-center gap-4 py-4"
          >
            {item.imageUrl && (
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-brand-rosa-claro">
                <Image src={item.imageUrl} alt="" fill className="object-cover" />
              </div>
            )}
            <div className="flex-1">
              <Link
                href={`/producto/${item.slug}`}
                className="font-body text-brand-ciruela hover:text-brand-rosa"
              >
                {item.name}
              </Link>
              <p className="text-sm text-brand-rosa">{formatPrice(item.unitPrice)}</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleUpdate(item.productId, item.variantId, item.imageId, item.qty - 1)
                  }
                  className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
                >
                  -
                </button>
                <span className="w-6 text-center text-sm text-brand-ciruela">{item.qty}</span>
                <button
                  type="button"
                  onClick={() =>
                    handleUpdate(item.productId, item.variantId, item.imageId, item.qty + 1)
                  }
                  className="h-8 w-8 rounded-md border border-brand-rosa-claro text-brand-ciruela hover:border-brand-rosa"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(item.productId, item.variantId, item.imageId)}
                  className="ml-2 text-sm text-red-600 hover:underline"
                >
                  Quitar
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-brand-rosa-claro pt-4">
        <span className="font-heading text-lg text-brand-ciruela">Subtotal</span>
        <span className="font-heading text-xl text-brand-rosa">
          {formatPrice(computeSubtotal(items))}
        </span>
      </div>
      <Link href="/checkout">
        <Button className="w-full bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
          Proceder al pago
        </Button>
      </Link>
      {lineaEditando && (
        <EstampadoPickerModal
          open
          images={lineaEditando.estampados}
          seleccionInicial={lineaEditando.imageId ? [lineaEditando.imageId] : []}
          modoUnico
          onClose={() => setLineaEditando(null)}
          onConfirm={(imageIds) => handleCambiarEstampado(imageIds[0])}
        />
      )}
    </div>
  );
}
