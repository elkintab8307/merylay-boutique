"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { actualizarCliente } from "./actions";

export function EditarClienteForm({
  id,
  clienteInicial,
}: {
  id: string;
  clienteInicial: { nombre: string; telefono: string; cedula: string | null; direccion: string | null };
}) {
  const [nombre, setNombre] = useState(clienteInicial.nombre);
  const [telefono, setTelefono] = useState(clienteInicial.telefono);
  const [cedula, setCedula] = useState(clienteInicial.cedula ?? "");
  const [direccion, setDireccion] = useState(clienteInicial.direccion ?? "");
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleGuardar = () => {
    setError(null);
    setGuardado(false);
    startTransition(async () => {
      const resultado = await actualizarCliente(id, { nombre, telefono, cedula, direccion });
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      setGuardado(true);
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
      <div>
        <label htmlFor="nombre" className="text-sm text-brand-ciruela">Nombre</label>
        <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </div>
      <div>
        <label htmlFor="telefono" className="text-sm text-brand-ciruela">Teléfono</label>
        <Input id="telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </div>
      <div>
        <label htmlFor="cedula" className="text-sm text-brand-ciruela">Cédula (opcional)</label>
        <Input id="cedula" value={cedula} onChange={(e) => setCedula(e.target.value)} />
      </div>
      <div>
        <label htmlFor="direccion" className="text-sm text-brand-ciruela">Dirección (opcional)</label>
        <Input id="direccion" value={direccion} onChange={(e) => setDireccion(e.target.value)} />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {guardado && !error && <p className="text-sm text-emerald-600">Cambios guardados.</p>}
      <Button
        type="button"
        onClick={handleGuardar}
        disabled={isPending}
        className="w-fit bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
      >
        {isPending ? "Guardando..." : "Guardar cambios"}
      </Button>
    </div>
  );
}
