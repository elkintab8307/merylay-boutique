"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cambiarEstadoPedido } from "./actions";

const ESTADOS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "pagado", label: "Pagado" },
  { value: "enviado", label: "Enviado" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
] as const;

export function EstadoPedidoSelect({
  orderId,
  estadoActual,
}: {
  orderId: string;
  estadoActual: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleChange = (nuevoEstado: string) => {
    setError(null);
    startTransition(async () => {
      const result = await cambiarEstadoPedido(orderId, nuevoEstado);
      if (result?.error) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="estado" className="text-sm text-brand-ciruela">
        Estado del pedido
      </label>
      <select
        id="estado"
        value={estadoActual}
        disabled={isPending}
        onChange={(e) => handleChange(e.target.value)}
        className="w-fit rounded border border-brand-rosa-claro bg-white px-2 py-1 text-sm text-brand-ciruela disabled:opacity-50"
      >
        {ESTADOS.map((estado) => (
          <option key={estado.value} value={estado.value}>
            {estado.label}
          </option>
        ))}
      </select>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
