"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleResenaActiva } from "./actions";

export function ToggleResenaButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleClick = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await toggleResenaActiva(id, !isActive);
        if (result?.error) {
          setError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setError("No se pudo actualizar el estado de la reseña.");
      }
    });
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-brand-ciruela/70 hover:text-brand-rosa hover:underline"
      >
        {isActive ? "Desactivar" : "Activar"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
