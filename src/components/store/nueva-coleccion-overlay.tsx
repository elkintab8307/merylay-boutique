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

const CLAVE_SESSION_STORAGE = "nueva-coleccion-vista";

export function NuevaColeccionOverlay({ items }: { items: NuevaColeccionItem[] }) {
  const [mostrar, setMostrar] = useState(false);
  const cerrarRef = useRef<HTMLButtonElement | null>(null);
  const { ref } = useCarruselTactil({ total: items.length, autoAvanceMs: 2500 });

  useEffect(() => {
    if (items.length === 0) return;
    if (sessionStorage.getItem(CLAVE_SESSION_STORAGE)) return;
    sessionStorage.setItem(CLAVE_SESSION_STORAGE, "1");
    // sessionStorage solo existe en el navegador; el estado real se conoce
    // tras montar, por eso se fija aqui y no durante el render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMostrar(true);
  }, [items.length]);

  useEffect(() => {
    if (!mostrar) return;
    cerrarRef.current?.focus();
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMostrar(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previo;
      document.removeEventListener("keydown", onKey);
    };
  }, [mostrar]);

  if (!mostrar || items.length === 0 || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Nueva Colección"
      onClick={(e) => {
        if (e.target === e.currentTarget) setMostrar(false);
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
    >
      <div className="relative w-full max-w-2xl animate-nueva-coleccion-in rounded-2xl border border-brand-oro bg-brand-crema p-6 shadow-brand-lg motion-reduce:animate-none">
        <button
          ref={cerrarRef}
          type="button"
          aria-label="Cerrar"
          onClick={() => setMostrar(false)}
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
                  <span className="absolute left-1 top-1 animate-pulse rounded-full bg-brand-rosa px-2 py-0.5 text-[10px] font-semibold text-brand-crema">
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
    </div>,
    document.body,
  );
}
