"use client";

import { useState } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { getVariantOptions, findMatchingVariant } from "@/lib/store/variants";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import type { PosProductoResult } from "./product-browser-action";
import { EstampadoPickerModal } from "@/components/store/estampado-picker-modal";

export function ProductCardPos({
  product,
  umbralStockBajo,
  onAdd,
}: {
  product: PosProductoResult;
  umbralStockBajo: number;
  onAdd: (item: LocalCartItem) => void;
}) {
  const { tallas: tallasTodas, colores: coloresTodos } = getVariantOptions(product.variants);
  const hasVariants = product.variants.length > 0;
  const [modalAbierto, setModalAbierto] = useState(false);
  const [talla, setTalla] = useState<string | null>(null);
  const [color, setColor] = useState<string | null>(null);

  // Stock total de cada talla, sumando todas sus variantes de color -- no se
  // muestra en la tarjeta, solo se usa para decidir que tallas ocultar (sin
  // stock) y para la insignia de stock una vez se elige una talla.
  const stockPorTalla = new Map<string, number>();
  for (const v of product.variants) {
    if (!v.talla) continue;
    stockPorTalla.set(v.talla, (stockPorTalla.get(v.talla) ?? 0) + v.stock);
  }

  // Una talla o un color sin stock no se muestra como opcion -- no tiene
  // sentido dejar elegir algo que ya no se puede vender.
  const tieneDimensionTalla = tallasTodas.length > 0;
  const tallas = tallasTodas.filter((t) => (stockPorTalla.get(t) ?? 0) > 0);
  const coloresParaMostrar = tieneDimensionTalla
    ? talla
      ? Array.from(
          new Set(
            product.variants
              .filter((v) => v.talla === talla && v.stock > 0)
              .map((v) => v.color)
              .filter((c): c is string => Boolean(c)),
          ),
        )
      : []
    : coloresTodos.filter((c) => product.variants.some((v) => v.color === c && v.stock > 0));
  const tallaLista = !tieneDimensionTalla || talla !== null;
  const mostrarConfirmar = tallaLista && (coloresParaMostrar.length === 0 || color !== null);

  const variantSeleccionada = hasVariants ? findMatchingVariant(product.variants, talla, color) : null;

  // Antes de elegir una talla, la insignia debe mostrar el total real de
  // unidades del producto (sumando todas las variantes) -- no el maximo de
  // una sola variante, que parece un total pero no lo es.
  const stockColapsado = hasVariants
    ? product.variants.reduce((sum, v) => sum + v.stock, 0)
    : product.stock;

  const stockDisponible = !hasVariants
    ? product.stock
    : (variantSeleccionada?.stock ??
      (talla ? (stockPorTalla.get(talla) ?? 0) : stockColapsado));

  const unitPrice = variantSeleccionada?.priceOverride ?? product.price;
  const agotado = stockDisponible <= 0;
  const imagenesDeVariante = variantSeleccionada?.images ?? [];
  const imagenPrincipal = imagenesDeVariante[0]?.url ?? product.imageUrl;

  const stockBadge =
    stockDisponible === 0
      ? { variant: "danger" as const, label: "Agotado" }
      : stockDisponible <= umbralStockBajo
        ? { variant: "warning" as const, label: `${stockDisponible} unidades` }
        : { variant: "neutral" as const, label: `${stockDisponible} unidades` };

  const agregarItems = (imageIds: (string | null)[]) => {
    const variantLabel = [talla, color].filter(Boolean).join(" / ");
    for (const imageId of imageIds) {
      const imagenElegida = imageId
        ? imagenesDeVariante.find((img) => img.imageId === imageId)
        : undefined;
      onAdd({
        productId: product.id,
        variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
        imageId: imageId ?? null,
        slug: "",
        name: hasVariants && variantLabel ? `${product.name} (${variantLabel})` : product.name,
        unitPrice,
        qty: 1,
        imageUrl: imagenElegida?.url ?? imagenPrincipal,
        stock: stockDisponible,
      });
    }
    setTalla(null);
    setColor(null);
  };

  const confirmarAgregar = () => {
    if (imagenesDeVariante.length > 1) {
      setModalAbierto(true);
      return;
    }
    agregarItems([imagenesDeVariante[0]?.imageId ?? null]);
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand-rosa-claro bg-white p-3 shadow-brand-sm">
      <div className="relative aspect-square w-full overflow-hidden rounded-md bg-brand-rosa-claro">
        {imagenPrincipal && (
          <Image src={imagenPrincipal} alt={product.name} fill className="object-contain" />
        )}
      </div>
      <p className="text-sm text-brand-ciruela">{product.name}</p>
      <div className="flex items-center justify-between">
        <span className="font-heading text-brand-rosa">{formatPrice(unitPrice)}</span>
        <Badge variant={stockBadge.variant}>{stockBadge.label}</Badge>
      </div>

      {hasVariants && (
        <div className="flex flex-col gap-2 rounded-md border border-brand-rosa-claro bg-brand-crema p-2">
          {tallas.length > 0 && (
            <div role="group" aria-label="Talla" className="flex flex-wrap gap-1">
              {tallas.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setTalla(t);
                    setColor(null);
                  }}
                  aria-pressed={talla === t}
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
          {tallaLista && coloresParaMostrar.length > 0 && (
            <div role="group" aria-label="Color" className="flex flex-wrap gap-1">
              {coloresParaMostrar.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-pressed={color === c}
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
          {mostrarConfirmar && (
            <button
              type="button"
              disabled={agotado}
              onClick={confirmarAgregar}
              className="rounded-md bg-brand-rosa px-2 py-1 text-xs text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
            >
              Confirmar
            </button>
          )}
        </div>
      )}

      {!hasVariants && (
        <button
          type="button"
          disabled={agotado}
          onClick={confirmarAgregar}
          className="rounded-md bg-brand-rosa px-2 py-1 text-xs text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
        >
          Agregar
        </button>
      )}

      <EstampadoPickerModal
        open={modalAbierto}
        images={imagenesDeVariante}
        seleccionInicial={[]}
        modoUnico={false}
        onClose={() => setModalAbierto(false)}
        onConfirm={(imageIds) => {
          setModalAbierto(false);
          agregarItems(imageIds);
        }}
      />
    </div>
  );
}
