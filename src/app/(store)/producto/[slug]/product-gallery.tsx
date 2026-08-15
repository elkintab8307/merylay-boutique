"use client";

import { useState } from "react";
import Image from "next/image";

export function ProductGallery({
  images,
  productName,
}: {
  images: { url: string; alt: string | null }[];
  productName: string;
}) {
  const [selected, setSelected] = useState(0);

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-brand-rosa-claro text-brand-ciruela/50">
        Sin imagen
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-brand-rosa-claro">
        <Image
          src={images[selected].url}
          alt={images[selected].alt ?? productName}
          fill
          className="object-contain"
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-script text-2xl text-brand-crema drop-shadow-[0_1px_3px_rgba(110,42,68,0.6)]">
          MeryLay
        </span>
      </div>
      {images.length > 1 && (
        <div className="flex gap-2">
          {images.map((image, index) => (
            <button
              key={image.url}
              type="button"
              onClick={() => setSelected(index)}
              className={`relative h-16 w-16 overflow-hidden rounded-md border ${
                index === selected ? "border-brand-rosa" : "border-brand-rosa-claro"
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
