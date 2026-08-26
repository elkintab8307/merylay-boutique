"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { eliminarProducto } from "./actions";

export function EliminarProductoButton({ id, nombre }: { id: string; nombre: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    if (!window.confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return;

    setError(null);
    startTransition(async () => {
      const result = await eliminarProducto(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-red-600 hover:underline disabled:opacity-50"
      >
        {isPending ? "Eliminando..." : "Eliminar"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
