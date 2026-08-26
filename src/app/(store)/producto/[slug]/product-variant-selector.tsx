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
import { EstampadoPickerModal, type EstampadoOption } from "@/components/store/estampado-picker-modal";

export function ProductVariantSelector({
  productId,
  productSlug,
  productName,
  imageUrl,
  basePrice,
  variants,
  baseStock,
  currentUserId,
  talla,
  color,
  onTallaChange,
  onColorChange,
  imagenesDeVarianteActual,
}: {
  productId: string;
  productSlug: string;
  productName: string;
  imageUrl: string | null;
  basePrice: number;
  variants: VariantOption[];
  baseStock: number;
  currentUserId: string | null;
  talla: string | null;
  color: string | null;
  onTallaChange: (talla: string | null) => void;
  onColorChange: (color: string | null) => void;
  imagenesDeVarianteActual: EstampadoOption[];
}) {
  const { tallas, colores } = useMemo(() => getVariantOptions(variants), [variants]);
  const [message, setMessage] = useState<string | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
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

  const agregarItems = (imageIds: (string | null)[]) => {
    setMessage(null);
    const items: LocalCartItem[] = imageIds.map((imageId) => {
      const imagenElegida = imageId
        ? imagenesDeVarianteActual.find((img) => img.imageId === imageId)
        : undefined;
      return {
        productId,
        variantId: hasVariants ? (variantSeleccionada?.id ?? null) : null,
        imageId: imageId ?? null,
        slug: productSlug,
        name: displayName,
        unitPrice,
        qty: 1,
        imageUrl: imagenElegida?.url ?? imageUrl,
        stock: stockDisponible,
      };
    });

    if (currentUserId) {
      startTransition(async () => {
        for (const item of items) {
          const result = await addToCart(item.productId, item.variantId, item.imageId, 1, item.unitPrice);
          if (result?.error) {
            setMessage(result.error);
            return;
          }
        }
        setMessage(items.length > 1 ? "Agregados al carrito." : "Agregado al carrito.");
      });
    } else {
      let current = getLocalCart();
      for (const item of items) {
        current = mergeCartItem(current, item);
      }
      saveLocalCart(current);
      setMessage(items.length > 1 ? "Agregados al carrito." : "Agregado al carrito.");
    }
  };

  const handleAddToCart = () => {
    if (imagenesDeVarianteActual.length > 1) {
      setModalAbierto(true);
      return;
    }
    agregarItems([imagenesDeVarianteActual[0]?.imageId ?? null]);
  };

  return (
    <div className="flex flex-col gap-4">
      {tallas.length > 0 && (
        <div>
          <label className="text-sm text-brand-ciruela">Talla</label>
          <select
            value={talla ?? ""}
            onChange={(e) => onTallaChange(e.target.value || null)}
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
            onChange={(e) => onColorChange(e.target.value || null)}
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

      <EstampadoPickerModal
        open={modalAbierto}
        images={imagenesDeVarianteActual}
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
