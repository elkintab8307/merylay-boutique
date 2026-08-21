"use client";

import { useState, useTransition } from "react";
import { Printer } from "lucide-react";
import { reimprimirUltimoRecibo } from "./reimprimir-action";

export function ImprimirUltimoReciboButton() {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      const result = await reimprimirUltimoRecibo();
      if (result?.error) {
        setError(result.error);
      }
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-brand-rosa-claro px-3 py-1.5 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30 disabled:opacity-50"
      >
        <Printer className="h-4 w-4" />
        {isPending ? "Abriendo..." : "Imprimir"}
      </button>
      {error && (
        <p className="absolute right-0 top-full z-10 mt-1 w-48 rounded-md bg-white p-2 text-xs text-red-600 shadow-brand-sm">
          {error}
        </p>
      )}
    </div>
  );
}
