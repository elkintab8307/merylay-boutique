import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaGanancia } from "./grafica-ganancia";

export default async function InformeGananciaPage({
  searchParams,
}: PageProps<"/admin/informes/ganancia">) {
  const params = await searchParams;
  const { desde, hasta, error: errorRango } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc(
    "informe_ganancia_serie",
    { p_desde: desde, p_hasta: hasta },
  );

  const datos = filas ?? [];
  const totalVentas = datos.reduce((sum, f) => sum + f.ventas, 0);
  const totalCosto = datos.reduce((sum, f) => sum + f.costo_productos, 0);
  const totalGastos = datos.reduce((sum, f) => sum + f.gastos, 0);
  const totalGanancia = datos.reduce((sum, f) => sum + f.ganancia, 0);
  const unidadesSinCosto = datos.reduce(
    (sum, f) => sum + f.unidades_sin_costo,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Ganancia real
      </h1>
      <RangoFechaFiltro
        basePath="/admin/informes/ganancia"
        desde={desde}
        hasta={hasta}
        error={errorRango}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de ganancia.
        </p>
      ) : (
        <>
          {unidadesSinCosto > 0 && (
            <p className="rounded-lg border border-brand-oro bg-brand-crema p-4 text-sm text-brand-ciruela">
              {unidadesSinCosto} unidad{unidadesSinCosto === 1 ? "" : "es"}{" "}
              vendida{unidadesSinCosto === 1 ? "" : "s"} en este periodo
              correspond{unidadesSinCosto === 1 ? "e" : "en"} a productos sin
              costo registrado. Se contaron con costo 0, así que la ganancia
              mostrada puede estar sobreestimada.
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
              <p className="text-sm text-brand-ciruela/70">Ventas</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalVentas)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
              <p className="text-sm text-brand-ciruela/70">
                Costo de productos
              </p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalCosto)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
              <p className="text-sm text-brand-ciruela/70">Gastos</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalGastos)}
              </p>
            </div>
            <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
              <p className="text-sm text-brand-ciruela/70">Ganancia</p>
              <p className="font-heading text-2xl text-brand-rosa">
                {formatPrice(totalGanancia)}
              </p>
            </div>
          </div>
          {datos.length > 0 && <GraficaGanancia datos={datos} />}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                  <th className="py-2">Fecha</th>
                  <th className="py-2">Ventas</th>
                  <th className="py-2">Costo de productos</th>
                  <th className="py-2">Gastos</th>
                  <th className="py-2">Ganancia</th>
                </tr>
              </thead>
              <tbody>
                {datos.map((fila) => (
                  <tr
                    key={fila.fecha}
                    className="border-b border-brand-rosa-claro/50"
                  >
                    <td className="py-2">{fila.fecha}</td>
                    <td className="py-2">{formatPrice(fila.ventas)}</td>
                    <td className="py-2">{formatPrice(fila.costo_productos)}</td>
                    <td className="py-2">{formatPrice(fila.gastos)}</td>
                    <td className="py-2">{formatPrice(fila.ganancia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
