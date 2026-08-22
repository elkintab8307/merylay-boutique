"use client";

import { useState } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { getVariantOptions, findMatchingVariant } from "@/lib/store/variants";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { PosProductoResult } from "./product-browser-action";

export function ProductCardPos({
  product,
  umbralStockBajo,
  onAdd,
}: {
  product: PosProductoResult;
  umbralStockBajo: number;
  onAdd: (item: LocalCartItem) => void;
}) {
  const { tallas, colores } = getVariantOptions(product.variants);
  const hasVariants = product.variants.length > 0;
  const [seleccionando, setSeleccionando] = useState(false);
  const [talla, setTalla] = useState<string | null>(product.variants[0]?.talla ?? null);
  const [color, setColor] = useState<string | null>(product.variants[0]?.color ?? null);

  const variantSeleccionada = hasVariants
    ? findMatchingVariant(product.variants, talla, color)
    : null;
  const stockDisponible = hasVariants ? (variantSeleccionada?.stock ?? 0) : product.stock;
  const unitPrice = variantSeleccionada?.priceOverride ?? product.price;
  const agotado = stockDisponible <= 0;

  const stockBadge =
    stockDisponible === 0
      ? { variant: "danger" as const, label: "Agotado" }
      : stockDisponible <= umbralStockBajo
        ? { variant: "warning" as const, label: `${stockDisponible} unidades` }
        : { variant: "neutral" as const, label: `${stockDisponible} unidades` };

  const confirmarAgregar = () => {
    const variantLabel = [talla, color].filter(Boolean).join(" / ");
    onAdd({
      productId: product.id,
      variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
      slug: "",
      name: hasVariants && variantLabel ? `${product.name} (${variantLabel})` : product.name,
      unitPrice,
      qty: 1,
      imageUrl: product.imageUrl,
      stock: stockDisponible,
    });
    setSeleccionando(false);
  };

  const handleAgregarClick = () => {
    if (hasVariants && !seleccionando) {
      setSeleccionando(true);
      return;
    }
    confirmarAgregar();
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-3 shadow-brand-sm">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-brand-rosa-claro">
        {product.imageUrl && (
          <Image src={product.imageUrl} alt={product.name} fill className="object-contain" />
        )}
      </div>
      <p className="text-sm text-brand-ciruela">{product.name}</p>
      <div className="flex items-center justify-between">
        <span className="font-heading text-brand-rosa">{formatPrice(unitPrice)}</span>
        <Badge variant={stockBadge.variant}>{stockBadge.label}</Badge>
      </div>

      {seleccionando && hasVariants && (
        <div className="flex flex-col gap-2 rounded-md border border-brand-rosa-claro bg-brand-crema p-2">
          {tallas.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tallas.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTalla(t)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    talla === t
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
          {colores.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {colores.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    color === c
                      ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                      : "border-brand-rosa-claro text-brand-ciruela"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            disabled={agotado}
            onClick={confirmarAgregar}
            className="rounded-md bg-brand-rosa px-2 py-1 text-xs text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      )}

      {!seleccionando && (
        <button
          type="button"
          disabled={agotado}
          onClick={handleAgregarClick}
          className="rounded-md bg-brand-rosa px-2 py-1 text-xs text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
        >
          Agregar
        </button>
      )}
    </div>
  );
}
