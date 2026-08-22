"use client";

import { useState, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { buscarClientes, crearCliente, type PosCustomerResult } from "./customer-actions";

export type ClienteSeleccionado = PosCustomerResult;

export function ClienteSelector({
  cliente,
  onChange,
  requerido = false,
}: {
  cliente: ClienteSeleccionado | null;
  onChange: (cliente: ClienteSeleccionado | null) => void;
  requerido?: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const [query, setQuery] = useState("");
  const [resultados, setResultados] = useState<PosCustomerResult[]>([]);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [telefonoNuevo, setTelefonoNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBuscando, startBuscar] = useTransition();
  const [isCreando, startCrear] = useTransition();

  const handleBuscar = () => {
    startBuscar(async () => {
      const encontrados = await buscarClientes(query);
      setResultados(encontrados);
    });
  };

  const handleSeleccionar = (encontrado: PosCustomerResult) => {
    onChange(encontrado);
    setExpandido(false);
    setResultados([]);
    setQuery("");
  };

  const handleCrear = () => {
    setError(null);
    startCrear(async () => {
      const resultado = await crearCliente(nombreNuevo, telefonoNuevo);
      if (resultado.error) {
        setError(resultado.error);
        return;
      }
      if (resultado.cliente) {
        handleSeleccionar(resultado.cliente);
        setNombreNuevo("");
        setTelefonoNuevo("");
      }
    });
  };

  if (cliente && !expandido) {
    return (
      <div className="flex items-center justify-between rounded-md border border-brand-rosa-claro bg-brand-rosa-claro/20 px-3 py-2 text-sm">
        <div>
          <p className="font-medium text-brand-ciruela">{cliente.nombre}</p>
          <p className="text-xs text-brand-ciruela/60">{cliente.telefono}</p>
        </div>
        <button
          type="button"
          onClick={() => setExpandido(true)}
          className="text-brand-rosa hover:underline"
        >
          Cambiar
        </button>
      </div>
    );
  }

  if (!expandido) {
    return (
      <button
        type="button"
        onClick={() => setExpandido(true)}
        className="text-left text-sm text-brand-rosa hover:underline"
      >
        + Agregar cliente{requerido ? " (obligatorio para crédito)" : ""}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-brand-rosa-claro bg-white p-3">
      <p className="text-sm font-semibold text-brand-ciruela">Cliente</p>
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre o teléfono"
          onKeyDown={(e) => e.key === "Enter" && handleBuscar()}
        />
        <Button
          type="button"
          onClick={handleBuscar}
          disabled={isBuscando}
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          {isBuscando ? "Buscando..." : "Buscar"}
        </Button>
      </div>
      {resultados.length > 0 && (
        <ul className="flex flex-col divide-y divide-brand-rosa-claro rounded-md border border-brand-rosa-claro">
          {resultados.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => handleSeleccionar(r)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-brand-rosa-claro/20"
              >
                <span className="text-brand-ciruela">{r.nombre}</span>
                <span className="ml-2 text-xs text-brand-ciruela/60">{r.telefono}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query && !isBuscando && resultados.length === 0 && (
        <p className="text-xs text-brand-ciruela/60">Sin resultados.</p>
      )}

      <p className="text-xs font-medium text-brand-ciruela/70">Crear cliente nuevo</p>
      <div className="flex flex-col gap-2">
        <Input
          value={nombreNuevo}
          onChange={(e) => setNombreNuevo(e.target.value)}
          placeholder="Nombre"
        />
        <Input
          value={telefonoNuevo}
          onChange={(e) => setTelefonoNuevo(e.target.value)}
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
      {error && <p className="text-xs text-red-600">{error}</p>}
      {cliente && (
        <button
          type="button"
          onClick={() => setExpandido(false)}
          className="text-xs text-brand-ciruela/60 hover:underline"
        >
          Cancelar
        </button>
      )}
    </div>
  );
}
