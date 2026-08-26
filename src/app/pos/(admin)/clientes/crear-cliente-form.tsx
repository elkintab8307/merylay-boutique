"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { crearCliente } from "@/app/pos/customer-actions";

export function CrearClienteForm() {
  const router = useRouter();
  const [expandido, setExpandido] = useState(false);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCreando, startCrear] = useTransition();

  const handleCrear = () => {
    setError(null);
    startCrear(async () => {
      const resultado = await crearCliente(nombre, telefono);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setNombre("");
      setTelefono("");
      setExpandido(false);
      router.refresh();
    });
  };

  if (!expandido) {
    return (
      <Button
        type="button"
        onClick={() => setExpandido(true)}
        className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        + Nuevo cliente
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-brand-rosa-claro bg-white p-4">
      <p className="text-sm font-semibold text-brand-ciruela">Crear cliente nuevo</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
        />
        <Input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Teléfono"
        />
        <Button
          type="button"
          onClick={handleCrear}
          disabled={isCreando}
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          {isCreando ? "Creando..." : "Crear cliente"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={() => setExpandido(false)}
        className="w-fit text-xs text-brand-ciruela/60 hover:underline"
      >
        Cancelar
      </button>
    </div>
  );
}
