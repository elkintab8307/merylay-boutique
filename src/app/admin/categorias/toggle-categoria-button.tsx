"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toggleCategoriaActiva } from "./actions";

export function ToggleCategoriaButton({
  id,
  isActive,
}: {
  id: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      await toggleCategoriaActiva(id, !isActive);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="text-brand-ciruela/70 hover:text-brand-rosa hover:underline"
    >
      {isActive ? "Desactivar" : "Activar"}
    </button>
  );
}
