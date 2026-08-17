import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaVentas } from "./grafica-ventas";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

export default async function InformeVentasPage({
  searchParams,
}: PageProps<"/admin/informes/ventas">) {
  const params = await searchParams;
  const { desde, hasta, error: errorRango } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("informe_ventas_serie", {
    p_desde: desde,
    p_hasta: hasta,
  });

  const porFecha = new Map<
    string,
    { fecha: string; tienda: number; pos: number }
  >();
  for (const fila of filas ?? []) {
    const entry =
      porFecha.get(fila.fecha) ?? { fecha: fila.fecha, tienda: 0, pos: 0 };
    if (fila.canal === "tienda") entry.tienda = fila.monto;
    if (fila.canal === "pos") entry.pos = fila.monto;
    porFecha.set(fila.fecha, entry);
  }
  const datos = Array.from(porFecha.values());
  const totalTienda = datos.reduce((sum, d) => sum + d.tienda, 0);
  const totalPos = datos.reduce((sum, d) => sum + d.pos, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Ventas</h1>
      <RangoFechaFiltro
        basePath="/admin/informes/ventas"
        desde={desde}
        hasta={hasta}
        error={errorRango}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de ventas.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
              <p className="text-sm text-brand-ciruela/70">Tienda</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalTienda)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
              <p className="text-sm text-brand-ciruela/70">POS</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalPos)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
              <p className="text-sm text-brand-ciruela/70">Total</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalTienda + totalPos)}
              </p>
            </div>
          </div>
          {datos.length > 0 && <GraficaVentas datos={datos} />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Fecha</TableHeaderCell>
                <TableHeaderCell>Tienda</TableHeaderCell>
                <TableHeaderCell>POS</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {datos.map((fila) => (
                <TableRow key={fila.fecha}>
                  <TableCell>{fila.fecha}</TableCell>
                  <TableCell>{formatPrice(fila.tienda)}</TableCell>
                  <TableCell>{formatPrice(fila.pos)}</TableCell>
                  <TableCell>{formatPrice(fila.tienda + fila.pos)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
