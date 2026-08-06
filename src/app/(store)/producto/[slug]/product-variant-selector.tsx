"use client";

import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  getVariantOptions,
  findMatchingVariant,
  type VariantOption,
} from "@/lib/store/variants";
import { getLocalCart, saveLocalCart, mergeCartItem, type LocalCartItem } from "@/lib/cart/local-cart";
import { addToCart } from "@/app/(store)/carrito/actions";

export function ProductVariantSelector({
  productId,
  productSlug,
  productName,
  imageUrl,
  basePrice,
  variants,
  baseStock,
  currentUserId,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  imageUrl: string | null;
  basePrice: number;
  variants: VariantOption[];
  baseStock: number;
  currentUserId: string | null;
}) {
  const { tallas, colores } = useMemo(() => getVariantOptions(variants), [variants]);
  const [talla, setTalla] = useState<string | null>(variants[0]?.talla ?? null);
  const [color, setColor] = useState<string | null>(variants[0]?.color ?? null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const hasVariants = variants.length > 0;
  const variantSeleccionada = hasVariants
    ? findMatchingVariant(variants, talla, color)
    : null;
  const stockDisponible = hasVariants ? (variantSeleccionada?.stock ?? 0) : baseStock;
  const agotado = stockDisponible <= 0;
  const unitPrice = variantSeleccionada?.priceOverride ?? basePrice;
  const variantLabel = [talla, color].filter(Boolean).join(" / ");
  const displayName = hasVariants && variantLabel ? `${productName} (${variantLabel})` : productName;

  const handleAddToCart = () => {
    setMessage(null);
    const item: LocalCartItem = {
      productId,
      variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
      slug: productSlug,
      name: displayName,
      unitPrice,
      qty: 1,
      imageUrl,
      stock: stockDisponible,
    };

    if (currentUserId) {
      startTransition(async () => {
        const result = await addToCart(item.productId, item.variantId, 1, item.unitPrice);
        setMessage(result?.error ?? "Agregado al carrito.");
      });
    } else {
      const current = getLocalCart();
      saveLocalCart(mergeCartItem(current, item));
      setMessage("Agregado al carrito.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {tallas.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Talla</label>
          <select
            value={talla ?? ""}
            onChange={(e) => setTalla(e.target.value || null)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            {tallas.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}
      {colores.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Color</label>
          <select
            value={color ?? ""}
            onChange={(e) => setColor(e.target.value || null)}
            className="w-full rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          >
            {colores.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      <p className="text-sm text-brand-ciruela/70">
        {agotado ? "Agotado" : `Stock disponible: ${stockDisponible}`}
      </p>

      <Button
        type="button"
        disabled={agotado || isPending}
        onClick={handleAddToCart}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
      >
        {isPending ? "Agregando..." : "Agregar al carrito"}
      </Button>
      {message && <p className="text-sm text-brand-oro">{message}</p>}
    </div>
  );
}
