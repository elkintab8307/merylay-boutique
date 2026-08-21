"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { eliminarVenta } from "./actions";

export function EliminarVentaButton({ id, saleNumber }: { id: string; saleNumber: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    if (!window.confirm(`¿Eliminar la venta ${saleNumber}? Esto repone el stock vendido.`)) return;

    setError(null);
    startTransition(async () => {
      const result = await eliminarVenta(id);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-brand-ciruela/70 hover:text-red-600 hover:underline disabled:opacity-50"
      >
        {isPending ? "Eliminando..." : "Eliminar"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </>
  );
}
