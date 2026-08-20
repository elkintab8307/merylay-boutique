"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Snowflake } from "lucide-react";
import type { HeroContenido } from "@/lib/validation/home-contenido";

const INTERVALO_MS = 4000;

const COPOS_NIEVE = [
  { left: "4%", size: 14, delay: "0s", duration: "9s" },
  { left: "12%", size: 10, delay: "1.5s", duration: "7s" },
  { left: "20%", size: 16, delay: "3s", duration: "10s" },
  { left: "28%", size: 12, delay: "0.8s", duration: "8s" },
  { left: "36%", size: 9, delay: "2.2s", duration: "6.5s" },
  { left: "44%", size: 15, delay: "4s", duration: "9.5s" },
  { left: "52%", size: 11, delay: "1s", duration: "7.5s" },
  { left: "60%", size: 13, delay: "3.5s", duration: "8.5s" },
  { left: "68%", size: 10, delay: "0.4s", duration: "6s" },
  { left: "76%", size: 16, delay: "2.6s", duration: "10.5s" },
  { left: "84%", size: 12, delay: "1.8s", duration: "7.8s" },
  { left: "92%", size: 14, delay: "3.2s", duration: "9s" },
  { left: "8%", size: 9, delay: "4.5s", duration: "6.8s" },
  { left: "56%", size: 10, delay: "0.2s", duration: "8.2s" },
];

function EfectoNieve() {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {COPOS_NIEVE.map((copo, index) => (
        <Snowflake
          key={index}
          aria-hidden
          className="absolute animate-caer-nieve text-white opacity-70 drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
          style={{
            left: copo.left,
            width: copo.size,
            height: copo.size,
            animationDelay: copo.delay,
            animationDuration: copo.duration,
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
          quality={90}
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
      className={`relative flex items-center rounded-2xl ${
        tieneImagenMovilPropia
          ? "aspect-[2/3] sm:aspect-[2/1]"
          : "aspect-[4/3] sm:aspect-[2/1] lg:aspect-[3/1]"
      }`}
    >
      <div className="absolute inset-0 overflow-hidden rounded-2xl">
        {hayImagenes ? (
          <>
            <CarruselImagenes imagenes={imagenesMobile} claseVisibilidad="block sm:hidden" />
            <CarruselImagenes imagenes={imagenesDesktop} claseVisibilidad="hidden sm:block" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-brand-rosa-claro via-brand-crema to-brand-rosa-medio" />
        )}
        <EfectoNieve />
      </div>
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
