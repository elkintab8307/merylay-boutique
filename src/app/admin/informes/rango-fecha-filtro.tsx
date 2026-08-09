import Link from "next/link";
import {
  rangoEsteAnio,
  rangoEstaSemana,
  rangoHoy,
  rangoMesActual,
} from "@/lib/informes/rango-fecha";
import { Button } from "@/components/ui/button";

function enlacePreset(
  basePath: string,
  rango: { desde: string; hasta: string },
) {
  return `${basePath}?desde=${rango.desde}&hasta=${rango.hasta}`;
}

export function RangoFechaFiltro({
  basePath,
  desde,
  hasta,
}: {
  basePath: string;
  desde: string;
  hasta: string;
}) {
  const presets = [
    { label: "Hoy", rango: rangoHoy() },
    { label: "Esta semana", rango: rangoEstaSemana() },
    { label: "Este mes", rango: rangoMesActual() },
    { label: "Este año", rango: rangoEsteAnio() },
  ];

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => (
          <Link
            key={preset.label}
            href={enlacePreset(basePath, preset.rango)}
            className="rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            {preset.label}
          </Link>
        ))}
      </div>
      <form
        method="get"
        action={basePath}
        className="flex flex-wrap items-end gap-3"
      >
        <div>
          <label htmlFor="desde" className="text-sm text-brand-ciruela">
            Desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            defaultValue={desde}
            className="block rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="hasta" className="text-sm text-brand-ciruela">
            Hasta
          </label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            defaultValue={hasta}
            className="block rounded-md border border-brand-rosa-claro bg-white px-3 py-2 text-sm"
          />
        </div>
        <Button
          type="submit"
          className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90"
        >
          Filtrar
        </Button>
      </form>
    </div>
  );
}
