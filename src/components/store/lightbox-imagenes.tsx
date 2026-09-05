"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useCarruselTactil } from "@/lib/store/use-carrusel-tactil";

export function LightboxImagenes({
  images,
  indiceInicial,
  productName,
  onClose,
}: {
  images: { url: string; alt: string | null }[];
  indiceInicial: number;
  productName: string;
  onClose: () => void;
}) {
  const { ref, indice, irA } = useCarruselTactil({
    total: images.length,
    indiceInicial,
  });
  const cerrarRef = useRef<HTMLButtonElement | null>(null);
  const montado = useRef(false);

  // Posiciona el scroll en la imagen inicial una sola vez, sin animacion.
  // El estado `indice` ya arranca en `indiceInicial` (via el hook), asi que
  // esto es solo para el scrollTo del track.
  useEffect(() => {
    if (montado.current) return;
    montado.current = true;
    irA(indiceInicial, { suave: false });
    cerrarRef.current?.focus();
  }, [indiceInicial, irA]);

  // Esc para cerrar; flechas para navegar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") irA(indice - 1);
      else if (e.key === "ArrowRight") irA(indice + 1);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, irA, indice]);

  // Bloquea el scroll del body mientras el lightbox esta abierto.
  useEffect(() => {
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previo;
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Imágenes de ${productName}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
    >
      <button
        ref={cerrarRef}
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-2 text-brand-crema"
      >
        <X className="h-5 w-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            disabled={indice === 0}
            onClick={() => irA(indice - 1)}
            className="absolute left-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 text-brand-crema disabled:opacity-40 sm:flex"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            disabled={indice === images.length - 1}
            onClick={() => irA(indice + 1)}
            className="absolute right-3 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 text-brand-crema disabled:opacity-40 sm:flex"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      <div
        ref={ref}
        className="flex h-full w-full snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {images.map((img, i) => (
          <div
            key={img.url + i}
            data-slide
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            className="relative flex h-full w-full shrink-0 snap-start items-center justify-center"
          >
            <Image
              src={img.url}
              alt={img.alt ?? productName}
              fill
              className="pointer-events-none object-contain"
              sizes="100vw"
            />
          </div>
        ))}
      </div>

      <p className="absolute inset-x-0 bottom-3 text-center text-sm text-brand-crema">
        {indice + 1} / {images.length}
      </p>
    </div>,
    document.body,
  );
}
