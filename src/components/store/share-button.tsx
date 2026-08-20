"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Share2, Link as LinkIcon, Check } from "lucide-react";

export function ShareButton({ productName }: { productName: string }) {
  const [open, setOpen] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickFuera = (e: MouseEvent) => {
      if (contenedorRef.current && !contenedorRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickFuera);
    return () => document.removeEventListener("mousedown", handleClickFuera);
  }, [open]);

  const handleCompartir = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: productName, url: window.location.href });
      } catch {
        // el usuario cerro el menu nativo de compartir, no hay nada que hacer
      }
      return;
    }
    setOpen((abierto) => !abierto);
  };

  const handleCopiar = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopiado(true);
    setOpen(false);
    setTimeout(() => setCopiado(false), 2000);
  };

  const url = typeof window !== "undefined" ? window.location.href : "";
  const mensaje = `Mira este producto: ${productName}`;

  return (
    <div ref={contenedorRef} className="relative">
      <button
        type="button"
        onClick={handleCompartir}
        className="inline-flex w-fit items-center gap-2 rounded-md border border-brand-rosa-claro px-4 py-2 text-sm text-brand-ciruela transition hover:bg-brand-rosa-claro/30"
      >
        <Share2 className="h-4 w-4 text-brand-rosa" />
        {copiado ? "¡Enlace copiado!" : "Compartir"}
      </button>
      {open && (
        <div className="absolute left-0 z-10 mt-2 flex w-48 flex-col gap-1 rounded-md border border-brand-rosa-claro bg-white p-2 text-sm shadow-brand-md">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`${mensaje} ${url}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <Image src="/brand/whatsapp.png" alt="" width={16} height={16} />
            WhatsApp
          </a>
          <a
            href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            <Image src="/brand/facebook.webp" alt="" width={16} height={16} />
            Facebook
          </a>
          <button
            type="button"
            onClick={handleCopiar}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            {copiado ? (
              <Check className="h-4 w-4 text-brand-rosa" />
            ) : (
              <LinkIcon className="h-4 w-4 text-brand-rosa" />
            )}
            Copiar enlace
          </button>
        </div>
      )}
    </div>
  );
}
