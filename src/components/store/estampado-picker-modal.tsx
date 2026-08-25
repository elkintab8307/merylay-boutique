"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export type EstampadoOption = { imageId: string; url: string; alt: string | null };

export function toggleSeleccion(
  seleccionados: string[],
  imageId: string,
  modoUnico: boolean,
): string[] {
  if (modoUnico) {
    return [imageId];
  }
  return seleccionados.includes(imageId)
    ? seleccionados.filter((id) => id !== imageId)
    : [...seleccionados, imageId];
}

export function EstampadoPickerModal({
  open,
  images,
  seleccionInicial,
  modoUnico,
  onConfirm,
  onClose,
}: {
  open: boolean;
  images: EstampadoOption[];
  seleccionInicial: string[];
  modoUnico: boolean;
  onConfirm: (imageIds: string[]) => void;
  onClose: () => void;
}) {
  const [seleccionados, setSeleccionados] = useState<string[]>(seleccionInicial);

  // Reinicia la seleccion cada vez que el modal se abre de nuevo (por
  // ejemplo, al reabrirlo para otra variante o para "Cambiar estampado" de
  // otra linea) — sin esto quedaria la seleccion de la apertura anterior.
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeleccionados(seleccionInicial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const confirmar = () => {
    if (seleccionados.length === 0) return;
    onConfirm(seleccionados);
  };

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="bottom" className="mx-auto max-h-[80vh] max-w-lg rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="font-heading text-brand-ciruela">
            {modoUnico ? "Cambiar estampado" : "Elige el estampado"}
          </SheetTitle>
        </SheetHeader>
        <div className="grid grid-cols-3 gap-3 overflow-y-auto px-4 pb-4 sm:grid-cols-4">
          {images.map((image) => {
            const marcada = seleccionados.includes(image.imageId);
            return (
              <button
                key={image.imageId}
                type="button"
                onClick={() =>
                  setSeleccionados((prev) => toggleSeleccion(prev, image.imageId, modoUnico))
                }
                aria-pressed={marcada}
                className={`relative aspect-square overflow-hidden rounded-md border-2 ${
                  marcada ? "border-brand-rosa" : "border-brand-rosa-claro"
                }`}
              >
                <Image
                  src={image.url}
                  alt={image.alt ?? ""}
                  fill
                  className="object-cover"
                />
                {marcada && (
                  <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand-rosa text-brand-crema">
                    <Check className="h-3 w-3" />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-brand-rosa-claro p-4">
          <Button
            type="button"
            disabled={seleccionados.length === 0}
            onClick={confirmar}
            className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90 disabled:opacity-50"
          >
            {modoUnico ? "Cambiar" : `Agregar ${seleccionados.length || ""} al carrito`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
