"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { getVariantOptions, findMatchingVariant } from "@/lib/store/variants";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { PosSearchResult as PosSearchResultType } from "./search-action";

export function ProductSearchResult({
  product,
  onAdd,
}: {
  product: PosSearchResultType;
  onAdd: (item: LocalCartItem) => void;
}) {
  const { tallas, colores } = getVariantOptions(product.variants);
  const [talla, setTalla] = useState<string | null>(product.variants[0]?.talla ?? null);
  const [color, setColor] = useState<string | null>(product.variants[0]?.color ?? null);

  const hasVariants = product.variants.length > 0;
  const variantSeleccionada = hasVariants
    ? findMatchingVariant(product.variants, talla, color)
    : null;
  const stockDisponible = hasVariants ? (variantSeleccionada?.stock ?? 0) : product.stock;
  const unitPrice = variantSeleccionada?.priceOverride ?? product.price;
  const agotado = stockDisponible <= 0;

  const handleAdd = () => {
    const variantLabel = [talla, color].filter(Boolean).join(" / ");
    onAdd({
      productId: product.id,
      variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
      slug: "",
      name: hasVariants && variantLabel ? `${product.name} (${variantLabel})` : product.name,
      unitPrice,
      qty: 1,
      imageUrl: null,
      stock: stockDisponible,
    });
  };

  return (
    <div className="flex items-center justify-between gap-3 border-b border-brand-rosa-claro py-2">
      <div className="flex-1">
        <p className="text-sm text-brand-ciruela">{product.name}</p>
        <p className="text-xs text-brand-ciruela/60">SKU: {product.sku}</p>
      </div>
      {tallas.length > 0 && (
        <select
          value={talla ?? ""}
          onChange={(e) => setTalla(e.target.value || null)}
          className="rounded-md border border-brand-rosa-claro bg-white px-2 py-1 text-xs"
        >
          {tallas.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      )}
      {colores.length > 0 && (
        <select
          value={color ?? ""}
          onChange={(e) => setColor(e.target.value || null)}
          className="rounded-md border border-brand-rosa-claro bg-white px-2 py-1 text-xs"
        >
          {colores.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
      <span className="text-xs text-brand-ciruela/60">Stock: {stockDisponible}</span>
      <Button
        type="button"
        disabled={agotado}
        onClick={handleAdd}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
      >
        Agregar
      </Button>
    </div>
  );
}
