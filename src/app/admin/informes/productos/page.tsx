import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaProductos } from "./grafica-productos";

const LIMITE = 10;

export default async function InformeProductosPage({
  searchParams,
}: PageProps<"/admin/informes/productos">) {
  const params = await searchParams;
  const { desde, hasta } = resolverRango({
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
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de productos.
        </p>
      ) : (
        <>
          {datos.length > 0 && <GraficaProductos datos={datos} />}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Producto</th>
                <th className="py-2">Unidades</th>
                <th className="py-2">Ingreso</th>
              </tr>
            </thead>
            <tbody>
              {datos.map((fila) => (
                <tr
                  key={fila.productId}
                  className="border-b border-brand-rosa-claro/50"
                >
                  <td className="py-2">{fila.nombre}</td>
                  <td className="py-2">{fila.qty}</td>
                  <td className="py-2">{formatPrice(fila.ingreso)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
