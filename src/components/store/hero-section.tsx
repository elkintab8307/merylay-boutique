"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Sparkle } from "lucide-react";
import type { HeroContenido } from "@/lib/validation/home-contenido";

const INTERVALO_MS = 4000;

const ESTRELLAS = [
  { top: "10%", left: "8%", size: 14, delay: "0s" },
  { top: "18%", left: "88%", size: 18, delay: "0.6s" },
  { top: "52%", left: "14%", size: 10, delay: "1.2s" },
  { top: "72%", left: "92%", size: 16, delay: "1.8s" },
  { top: "14%", left: "50%", size: 12, delay: "2.4s" },
  { top: "82%", left: "42%", size: 14, delay: "0.3s" },
  { top: "38%", left: "78%", size: 9, delay: "1.5s" },
  { top: "34%", left: "22%", size: 17, delay: "2.1s" },
  { top: "65%", left: "60%", size: 11, delay: "0.9s" },
  { top: "8%", left: "68%", size: 13, delay: "1.9s" },
];

function EfectoEstrellas() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {ESTRELLAS.map((estrella, index) => (
        <Sparkle
          key={index}
          aria-hidden
          fill="currentColor"
          className="absolute animate-twinkle text-brand-oro drop-shadow-[0_0_4px_rgba(217,164,65,0.8)]"
          style={{
            top: estrella.top,
            left: estrella.left,
            width: estrella.size,
            height: estrella.size,
            animationDelay: estrella.delay,
          }}
        />
      ))}
    </div>
  );
}

function useCarrusel(total: number) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    if (total <= 1) return;
    const id = setTimeout(() => {
      setIndice((i) => (i + 1) % total);
    }, INTERVALO_MS);
    return () => clearTimeout(id);
  }, [indice, total]);

  return {
    indice,
    anterior: () => setIndice((i) => (i - 1 + total) % total),
    siguiente: () => setIndice((i) => (i + 1) % total),
  };
}

function CarruselImagenes({
  imagenes,
  claseVisibilidad,
}: {
  imagenes: string[];
  claseVisibilidad: string;
}) {
  const { indice, anterior, siguiente } = useCarrusel(imagenes.length);

  if (imagenes.length === 0) return null;

  return (
    <div className={`absolute inset-0 ${claseVisibilidad}`}>
      {imagenes.map((src, i) => (
        <Image
          key={src}
          src={src}
          alt=""
          fill
          priority={i === 0}
          sizes="100vw"
          className={`object-cover transition-opacity duration-700 ${
            i === indice ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      {imagenes.length > 1 && (
        <>
          <button
            type="button"
            onClick={anterior}
            aria-label="Imagen anterior"
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-brand-crema/70 p-1.5 text-brand-ciruela transition hover:bg-brand-crema"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={siguiente}
            aria-label="Siguiente imagen"
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-brand-crema/70 p-1.5 text-brand-ciruela transition hover:bg-brand-crema"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}

export function HeroSection({ hero }: { hero: HeroContenido | null }) {
  const imagenesDesktop = hero?.imagenesDesktop ?? [];
  const tieneImagenMovilPropia = Boolean(hero?.imagenesMobile.length);
  const imagenesMobile = tieneImagenMovilPropia ? hero!.imagenesMobile : imagenesDesktop;
  const hayImagenes = imagenesDesktop.length > 0 || imagenesMobile.length > 0;

  return (
    <section
      className={`relative flex items-center overflow-hidden rounded-2xl ${
        tieneImagenMovilPropia
          ? "aspect-[2/3] sm:aspect-[2/1]"
          : "aspect-[4/3] sm:aspect-[2/1] lg:aspect-[3/1]"
      }`}
    >
      {hayImagenes ? (
        <>
          <CarruselImagenes imagenes={imagenesMobile} claseVisibilidad="block sm:hidden" />
          <CarruselImagenes imagenes={imagenesDesktop} claseVisibilidad="hidden sm:block" />
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-brand-rosa-claro via-brand-crema to-brand-rosa-medio" />
      )}
      <EfectoEstrellas />
      <div className="absolute bottom-0 left-1/2 z-20 flex h-20 w-20 -translate-x-1/2 translate-y-1/2 items-center justify-center overflow-hidden rounded-full border-4 border-brand-crema bg-brand-crema shadow-brand-md">
        <Image
          src="/brand/logo-principal.png"
          alt=""
          width={80}
          height={80}
          className="h-full w-full object-contain"
        />
      </div>
    </section>
  );
}
