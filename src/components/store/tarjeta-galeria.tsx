"use client";

import { useState } from "react";
import Image from "next/image";
import { useCarruselTactil } from "@/lib/store/use-carrusel-tactil";

export function TarjetaGaleria({ images, alt }: { images: string[]; alt: string }) {
  // Desfase de arranque estable por tarjeta: evita que toda la grilla
  // avance al mismo tiempo. El inicializador diferido de useState corre
  // una sola vez por montaje, fuera del render.
  const [desfase] = useState(() => Math.floor(Math.random() * 1500));
  const { ref, indice, irA } = useCarruselTactil({
    total: images.length,
    autoAvanceMs: images.length > 1 ? 3000 : undefined,
    desfaseInicialMs: desfase,
  });

  if (images.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-brand-ciruela/50">
        Sin imagen
      </div>
    );
  }

  if (images.length === 1) {
    return <Image src={images[0]} alt={alt} fill className="object-contain" />;
  }

  return (
    <div className="absolute inset-0">
      <div
        ref={ref}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((url, i) => (
          <div key={url + i} className="relative h-full w-full shrink-0 snap-start">
            <Image src={url} alt={alt} fill className="object-contain" />
          </div>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
        {images.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ver imagen ${i + 1}`}
            aria-current={i === indice}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              irA(i);
            }}
            className={`pointer-events-auto h-1.5 w-1.5 rounded-full transition ${
              i === indice ? "bg-brand-crema" : "bg-brand-crema/50"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
