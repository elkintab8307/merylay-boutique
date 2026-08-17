import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaMetodosPago } from "./grafica-metodos-pago";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

export default async function InformeMetodosPagoPage({
  searchParams,
}: PageProps<"/admin/informes/metodos-pago">) {
  const params = await searchParams;
  const { desde, hasta, error: errorRango } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("informe_metodos_pago", {
    p_desde: desde,
    p_hasta: hasta,
  });

  const datos = (filas ?? []).map((fila) => ({
    metodo: fila.metodo,
    total: fila.total,
  }));
  const total = datos.reduce((sum, d) => sum + d.total, 0);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Métodos de pago
      </h1>
      <RangoFechaFiltro
        basePath="/admin/informes/metodos-pago"
        desde={desde}
        hasta={hasta}
        error={errorRango}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de métodos de pago.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <p className="text-sm text-brand-ciruela/70">Total del periodo</p>
            <p className="font-heading text-2xl text-brand-rosa">
              {formatPrice(total)}
            </p>
          </div>
          {datos.length > 0 && <GraficaMetodosPago datos={datos} />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Método</TableHeaderCell>
                <TableHeaderCell>Total</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {datos.map((fila) => (
                <TableRow key={fila.metodo}>
                  <TableCell className="capitalize">{fila.metodo}</TableCell>
                  <TableCell>{formatPrice(fila.total)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
