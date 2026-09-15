"use client";

import { useRef } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard, type ProductCardData } from "@/components/store/product-card";

/**
 * Fila de productos de una categoria, con scroll-snap nativo (se desliza
 * con el dedo en movil) y botones ‹ › que la desplazan en PC. Sin
 * auto-avance: es una lista fija (las primeras N de la categoria), no un
 * carrusel que rota solo.
 */
export function CarruselCategoria({
  titulo,
  verTodosHref,
  productos,
  currentUserId,
  favoritosSet,
}: {
  titulo: string;
  verTodosHref: string;
  productos: ProductCardData[];
  currentUserId: string | null;
  favoritosSet: Set<string>;
}) {
  const ref = useRef<HTMLDivElement>(null);

  if (productos.length === 0) return null;

  const desplazar = (direccion: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direccion * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-heading text-2xl text-brand-ciruela">{titulo}</h2>
        <div className="flex items-center gap-3">
          <Link
            href={verTodosHref}
            className="whitespace-nowrap text-sm text-brand-rosa hover:underline"
          >
            Ver todo →
          </Link>
          <div className="hidden gap-1 sm:flex">
            <button
              type="button"
              aria-label="Anterior"
              onClick={() => desplazar(-1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-rosa-claro text-brand-ciruela transition hover:bg-brand-rosa-claro"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Siguiente"
              onClick={() => desplazar(1)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-rosa-claro text-brand-ciruela transition hover:bg-brand-rosa-claro"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
      <div
        ref={ref}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 sm:gap-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {productos.map((producto) => (
          <div
            key={producto.slug}
            className="w-[46%] shrink-0 snap-start sm:w-[31%] md:w-[23%] lg:w-[18%]"
          >
            <ProductCard
              product={producto}
              currentUserId={currentUserId}
              initialFavorite={favoritosSet.has(producto.id)}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
