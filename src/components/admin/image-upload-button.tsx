"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ImageUploadButton({
  id,
  files,
  onChange,
  label = "Agregar imágenes",
  multiple = true,
}: {
  id: string;
  files: File[];
  onChange: (files: File[]) => void;
  label?: string;
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [prevFiles, setPrevFiles] = useState(files);
  const [previewUrls, setPreviewUrls] = useState<Map<File, string>>(new Map());

  // Sincroniza el mapa de object URLs con `files` durante el render (no en
  // un efecto): crea una URL para cada archivo nuevo y libera la de los
  // archivos que ya no estan en `files` (quitados con el "x" o
  // reemplazados). React permite ajustar el estado en el render cuando
  // cambia una prop/valor derivado — ver "Adjusting state when a prop
  // changes" en la documentacion de React.
  if (files !== prevFiles) {
    setPrevFiles(files);
    const siguiente = new Map<File, string>();
    for (const file of files) {
      siguiente.set(file, previewUrls.get(file) ?? URL.createObjectURL(file));
    }
    for (const [file, url] of previewUrls) {
      if (!siguiente.has(file)) {
        URL.revokeObjectURL(url);
      }
    }
    setPreviewUrls(siguiente);
  }

  // Mantiene una copia del ultimo mapa en un ref solo para poder liberar
  // las URLs restantes al desmontar (el ref se lee unicamente dentro del
  // efecto de limpieza, nunca durante el render).
  const previewUrlsRef = useRef(previewUrls);
  useEffect(() => {
    previewUrlsRef.current = previewUrls;
  }, [previewUrls]);

  useEffect(() => {
    return () => {
      for (const url of previewUrlsRef.current.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/*"
        multiple={multiple}
        className="sr-only"
        onChange={(e) => {
          onChange(Array.from(e.target.files ?? []));
          // Limpia el valor nativo del input despues de leerlo: si no se
          // hace, volver a elegir exactamente los mismos archivos (p. ej.
          // tras un rechazo por tamaño) no dispara onChange la segunda vez
          // en algunos navegadores.
          e.target.value = "";
        }}
      />
      <Button
        type="button"
        variant="outline"
        onClick={() => inputRef.current?.click()}
        className="w-fit border-brand-rosa text-brand-rosa hover:bg-brand-rosa/10"
      >
        <ImagePlus className="h-4 w-4" />
        {label}
      </Button>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map((file, index) => {
            const url = previewUrls.get(file);
            return (
              <div key={`${file.name}-${index}`} className="relative h-16 w-16">
                {url && (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa de un File local, no una URL remota optimizable
                  <img
                    src={url}
                    alt=""
                    className="h-full w-full rounded-md border border-brand-rosa-claro object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onChange(files.filter((_, i) => i !== index))}
                  className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] text-white"
                  aria-label={`Quitar ${file.name}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
