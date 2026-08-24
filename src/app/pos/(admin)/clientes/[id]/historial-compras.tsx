"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { formatPrice } from "@/lib/format";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

export type ProductoComprado = {
  nombre: string;
  varianteLabel: string | null;
  qty: number;
  lineTotal: number;
};

export type MovimientoHistorial = {
  id: string;
  tipo: "pos" | "tienda";
  fecha: string;
  total: number;
  href: string;
  productos: ProductoComprado[];
};

export function HistorialCompras({ historial }: { historial: MovimientoHistorial[] }) {
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHeaderCell />
          <TableHeaderCell>Fecha</TableHeaderCell>
          <TableHeaderCell>Origen</TableHeaderCell>
          <TableHeaderCell>Total</TableHeaderCell>
        </TableRow>
      </TableHeader>
      <tbody>
        {historial.map((mov) => {
          const key = `${mov.tipo}-${mov.id}`;
          const expandido = expandidoId === key;
          return (
            <Fragment key={key}>
              <TableRow>
                <TableCell>
                  <button
                    type="button"
                    onClick={() => setExpandidoId(expandido ? null : key)}
                    aria-label={expandido ? "Ocultar productos" : "Ver productos"}
                    aria-expanded={expandido}
                    className="flex h-6 w-6 items-center justify-center text-brand-ciruela"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${expandido ? "rotate-180" : ""}`}
                    />
                  </button>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {new Date(mov.fecha).toLocaleDateString("es-CO")}
                </TableCell>
                <TableCell>
                  <Link href={mov.href} className="text-brand-rosa hover:underline">
                    {mov.tipo === "pos" ? "POS" : "Tienda online"}
                  </Link>
                </TableCell>
                <TableCell>{formatPrice(mov.total)}</TableCell>
              </TableRow>
              {expandido && (
                <TableRow>
                  <TableCell colSpan={4} className="bg-brand-rosa-claro/10">
                    {mov.productos.length === 0 ? (
                      <p className="py-1 text-xs text-brand-ciruela/60">
                        No hay detalle de productos para esta compra.
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-1 py-1 text-sm text-brand-ciruela">
                        {mov.productos.map((producto, index) => (
                          <li key={index} className="flex justify-between">
                            <span>
                              {producto.nombre}
                              {producto.varianteLabel ? ` (${producto.varianteLabel})` : ""} ×{" "}
                              {producto.qty}
                            </span>
                            <span>{formatPrice(producto.lineTotal)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </Table>
  );
}
