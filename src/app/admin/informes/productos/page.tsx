import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaProductos } from "./grafica-productos";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

const LIMITE = 10;

export default async function InformeProductosPage({
  searchParams,
}: PageProps<"/admin/informes/productos">) {
  const params = await searchParams;
  const { desde, hasta, error: errorRango } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc(
    "informe_productos_vendidos",
    { p_desde: desde, p_hasta: hasta, p_limit: LIMITE },
  );

  const datos = (filas ?? []).map((fila) => ({
    productId: fila.product_id,
    nombre: fila.nombre,
    qty: Number(fila.qty),
    ingreso: fila.ingreso,
  }));

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Productos más vendidos
      </h1>
      <RangoFechaFiltro
        basePath="/admin/informes/productos"
        desde={desde}
        hasta={hasta}
        error={errorRango}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de productos.
        </p>
      ) : (
        <>
          {datos.length > 0 && <GraficaProductos datos={datos} />}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Unidades</TableHeaderCell>
                <TableHeaderCell>Ingreso</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {datos.map((fila) => (
                <TableRow key={fila.productId}>
                  <TableCell>{fila.nombre}</TableCell>
                  <TableCell>{fila.qty}</TableCell>
                  <TableCell>{formatPrice(fila.ingreso)}</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </>
      )}
    </div>
  );
}
