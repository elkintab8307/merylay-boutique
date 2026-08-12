import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaGastos } from "./grafica-gastos";

export default async function InformeGastosPage({
  searchParams,
}: PageProps<"/admin/informes/gastos">) {
  const params = await searchParams;
  const { desde, hasta } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("informe_gastos_serie", {
    p_desde: desde,
    p_hasta: hasta,
  });

  const categoriasUnicas = Array.from(
    new Set((filas ?? []).map((f) => f.categoria)),
  );
  const claveDeCategoria = new Map(
    categoriasUnicas.map((cat, i) => [cat, `cat${i}`]),
  );

  const porFecha = new Map<string, Record<string, number | string>>();
  for (const fila of filas ?? []) {
    const clave = claveDeCategoria.get(fila.categoria)!;
    const entry = porFecha.get(fila.fecha) ?? { fecha: fila.fecha };
    entry[clave] = (Number(entry[clave]) || 0) + fila.monto;
    porFecha.set(fila.fecha, entry);
  }
  const datosGrafica = Array.from(porFecha.values());
  const series = categoriasUnicas.map((cat, i) => ({
    clave: `cat${i}`,
    etiqueta: cat,
  }));

  const totalPorCategoria = new Map<string, number>();
  for (const fila of filas ?? []) {
    totalPorCategoria.set(
      fila.categoria,
      (totalPorCategoria.get(fila.categoria) ?? 0) + fila.monto,
    );
  }
  const total = Array.from(totalPorCategoria.values()).reduce(
    (sum, v) => sum + v,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Gastos</h1>
      <RangoFechaFiltro
        basePath="/admin/informes/gastos"
        desde={desde}
        hasta={hasta}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de gastos.
        </p>
      ) : (
        <>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4">
            <p className="text-sm text-brand-ciruela/70">Total del periodo</p>
            <p className="font-heading text-2xl text-brand-rosa">
              {formatPrice(total)}
            </p>
          </div>
          {datosGrafica.length > 0 && (
            <GraficaGastos datos={datosGrafica} series={series} />
          )}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                  <th className="py-2">Categoría</th>
                  <th className="py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(totalPorCategoria.entries()).map(
                  ([categoria, monto]) => (
                    <tr
                      key={categoria}
                      className="border-b border-brand-rosa-claro/50"
                    >
                      <td className="py-2">{categoria}</td>
                      <td className="py-2">{formatPrice(monto)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
