import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";
import { GraficaCompras } from "./grafica-compras";

export default async function InformeComprasPage({
  searchParams,
}: PageProps<"/admin/informes/compras">) {
  const params = await searchParams;
  const { desde, hasta } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data: filas, error } = await supabase.rpc("informe_compras_serie", {
    p_desde: desde,
    p_hasta: hasta,
  });

  const proveedoresUnicos = Array.from(
    new Set((filas ?? []).map((f) => f.proveedor)),
  );
  const claveDeProveedor = new Map(
    proveedoresUnicos.map((prov, i) => [prov, `prov${i}`]),
  );

  const porFecha = new Map<string, Record<string, number | string>>();
  for (const fila of filas ?? []) {
    const clave = claveDeProveedor.get(fila.proveedor)!;
    const entry = porFecha.get(fila.fecha) ?? { fecha: fila.fecha };
    entry[clave] = (Number(entry[clave]) || 0) + fila.monto;
    porFecha.set(fila.fecha, entry);
  }
  const datosGrafica = Array.from(porFecha.values());
  const series = proveedoresUnicos.map((prov, i) => ({
    clave: `prov${i}`,
    etiqueta: prov,
  }));

  const totalPorProveedor = new Map<string, number>();
  for (const fila of filas ?? []) {
    totalPorProveedor.set(
      fila.proveedor,
      (totalPorProveedor.get(fila.proveedor) ?? 0) + fila.monto,
    );
  }
  const total = Array.from(totalPorProveedor.values()).reduce(
    (sum, v) => sum + v,
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Compras</h1>
      <RangoFechaFiltro
        basePath="/admin/informes/compras"
        desde={desde}
        hasta={hasta}
      />
      {error ? (
        <p className="text-sm text-red-600">
          No se pudo cargar el informe de compras.
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
            <GraficaCompras datos={datosGrafica} series={series} />
          )}
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Proveedor</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(totalPorProveedor.entries()).map(
                ([proveedor, monto]) => (
                  <tr
                    key={proveedor}
                    className="border-b border-brand-rosa-claro/50"
                  >
                    <td className="py-2">{proveedor}</td>
                    <td className="py-2">{formatPrice(monto)}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}
