"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { calcularDescuento, precioEfectivo } from "@/lib/store/discount";
import { useCarruselTactil } from "@/lib/store/use-carrusel-tactil";
import type { NuevaColeccionItem } from "@/lib/store/fetch-nueva-coleccion";

export function NuevaColeccionOverlay({ items }: { items: NuevaColeccionItem[] }) {
  // Se muestra en cada carga/visita al home mientras haya variantes
  // activas -- sin marca de "ya la vi" en sessionStorage. El estado solo
  // sirve para permitir cerrarla (X/Esc/fondo) durante esta visita.
  const [mostrar, setMostrar] = useState(items.length > 0);

  if (!mostrar || items.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <PanelNuevaColeccion items={items} onCerrar={() => setMostrar(false)} />,
    document.body,
  );
}

function PanelNuevaColeccion({
  items,
  onCerrar,
}: {
  items: NuevaColeccionItem[];
  onCerrar: () => void;
}) {
  const cerrarRef = useRef<HTMLButtonElement | null>(null);
  // Sin autoAvanceMs: el carrusel solo se mueve con el gesto tactil del
  // usuario (o los controles, si el hook expone alguno mas adelante) --
  // no debe rotar solo.
  const { ref } = useCarruselTactil({ total: items.length });

  useEffect(() => {
    cerrarRef.current?.focus();
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", onKey);
    };
  }, [onCerrar]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nueva Colección"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm"
    >
      <div className="relative w-full max-w-2xl animate-nueva-coleccion-panel rounded-2xl border border-brand-oro/60 bg-brand-crema/80 p-6 shadow-[0_0_40px_8px_rgb(233_106_158_/_0.35),0_0_70px_20px_rgb(217_164_65_/_0.2)] backdrop-blur-xl motion-reduce:animate-none">
        <button
          ref={cerrarRef}
          type="button"
          aria-label="Cerrar"
          onClick={onCerrar}
          className="absolute right-3 top-3 rounded-full bg-black/10 p-2 text-brand-ciruela"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="mb-4 text-center font-heading text-2xl bg-gradient-to-r from-brand-oro via-brand-rosa to-brand-oro bg-clip-text text-transparent">
          ✨ Nueva Colección ✨
        </h2>

        <div
          ref={ref}
          className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {items.map((item, i) => {
            const descuento = calcularDescuento(item.price, item.promoPrice);
            const precioMostrado = precioEfectivo(item.price, item.promoPrice);
            return (
              <Link
                key={item.variantId}
                href={`/producto/${item.productSlug}`}
                style={{ animationDelay: `${i * 80}ms` }}
                className="w-40 shrink-0 snap-start animate-nueva-coleccion-in rounded-xl bg-white p-2 shadow-brand-sm motion-reduce:animate-none"
              >
                <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-brand-rosa-claro">
                  <Image src={item.imageUrl} alt={item.productName} fill className="object-cover" sizes="160px" />
                  <span className="absolute left-1 top-1 animate-pulse rounded-full bg-brand-rosa px-2 py-0.5 text-[10px] font-semibold text-brand-crema motion-reduce:animate-none">
                    NUEVO
                  </span>
                </div>
                <p className="mt-1 truncate text-xs text-brand-ciruela">{item.productName}</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-heading text-brand-rosa">{formatPrice(precioMostrado)}</span>
                  {descuento !== null && (
                    <span className="text-[10px] text-brand-ciruela/50 line-through">
                      {formatPrice(item.price)}
                    </span>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
