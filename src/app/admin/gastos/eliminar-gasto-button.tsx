"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteGasto } from "./actions";

export function EliminarGastoButton({ id }: { id: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    if (!window.confirm("¿Eliminar este gasto?")) return;

    setError(null);
    startTransition(async () => {
      const result = await deleteGasto(id);
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
        className="text-brand-ciruela/70 hover:text-red-600 hover:underline"
      >
        {isPending ? "Eliminando..." : "Eliminar"}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </>
  );
}
