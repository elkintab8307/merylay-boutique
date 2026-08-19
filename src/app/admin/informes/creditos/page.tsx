import { createClient } from "@/lib/supabase/server";
import { resolverRango } from "@/lib/informes/rango-fecha";
import { formatPrice } from "@/lib/format";
import { RangoFechaFiltro } from "../rango-fecha-filtro";

export default async function InformeCreditosPage({
  searchParams,
}: PageProps<"/admin/informes/creditos">) {
  const params = await searchParams;
  const { desde, hasta, error: errorRango } = resolverRango({
    desde: typeof params.desde === "string" ? params.desde : undefined,
    hasta: typeof params.hasta === "string" ? params.hasta : undefined,
  });

  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("informe_creditos_resumen", { p_desde: desde, p_hasta: hasta })
    .single();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Créditos</h1>
      <RangoFechaFiltro
        basePath="/admin/informes/creditos"
        desde={desde}
        hasta={hasta}
        error={errorRango}
      />
      {error || !data ? (
        <p className="text-sm text-red-600">No se pudo cargar el informe de créditos.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <p className="text-sm text-brand-ciruela/70">Cartera pendiente</p>
            <p className="font-heading text-2xl text-brand-ciruela">
              {formatPrice(data.cartera_pendiente)}
            </p>
          </div>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <p className="text-sm text-brand-ciruela/70">Monto vencido</p>
            <p className="font-heading text-2xl text-red-600">
              {formatPrice(data.monto_vencido)}
            </p>
          </div>
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <p className="text-sm text-brand-ciruela/70">Cobrado en abonos (periodo)</p>
            <p className="font-heading text-2xl text-brand-rosa">
              {formatPrice(data.cobrado_en_periodo)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
