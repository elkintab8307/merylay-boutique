"use client";

import { useState } from "react";
import Image from "next/image";

export function ProductGallery({
  images,
  productName,
  selectedVariantId = null,
  onSelectVariant,
}: {
  images: { url: string; alt: string | null; variantId: string | null }[];
  productName: string;
  selectedVariantId?: string | null;
  onSelectVariant?: (variantId: string | null) => void;
}) {
  const [selected, setSelected] = useState(0);
  // Ajuste de estado durante el render (en vez de useEffect) para resetear
  // la miniatura seleccionada solo cuando cambia la IDENTIDAD de la variante
  // seleccionada, no en cada render (el array `images` cambia de referencia
  // en cada render del padre). Ver: https://react.dev/learn/you-might-not-need-an-effect
  const [prevSelectedVariantId, setPrevSelectedVariantId] = useState(selectedVariantId);
  if (selectedVariantId !== prevSelectedVariantId) {
    setPrevSelectedVariantId(selectedVariantId);
    setSelected(0);
  }

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-brand-rosa-claro text-brand-ciruela/50">
        Sin imagen
      </div>
    );
  }

  // `selected` puede quedar temporalmente fuera de rango en el mismo render
  // en que cambia `images` (p. ej. al cambiar de variante vía el selector de
  // talla/color, sin pasar por un clic de miniatura): el ajuste de estado de
  // arriba programa `setSelected(0)` pero este render sigue ejecutándose con
  // el valor de estado aún desactualizado. Se recorta defensivamente contra
  // el largo ACTUAL de `images` antes de indexar.
  const activeIndex = selected < images.length ? selected : 0;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-brand-rosa-claro">
        <Image
          src={images[activeIndex].url}
          alt={images[activeIndex].alt ?? productName}
          fill
          className="object-contain"
        />
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => {
                setSelected(index);
                onSelectVariant?.(image.variantId);
              }}
              className={`relative h-16 w-16 overflow-hidden rounded-md border ${
                index === activeIndex ? "border-brand-rosa" : "border-brand-rosa-claro"
              }`}
            >
              <Image
                src={image.url}
                alt={image.alt ?? productName}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
