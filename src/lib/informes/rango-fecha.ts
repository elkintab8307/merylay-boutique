import { rangoFechaSchema } from "@/lib/validation/informes";

export type RangoFecha = { desde: string; hasta: string };

function formatearFecha(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

export function rangoHoy(hoy: Date = new Date()): RangoFecha {
  const fecha = formatearFecha(hoy);
  return { desde: fecha, hasta: fecha };
}

export function rangoEstaSemana(hoy: Date = new Date()): RangoFecha {
  const diaSemana = hoy.getUTCDay();
  const offsetLunes = diaSemana === 0 ? 6 : diaSemana - 1;
  const desde = new Date(
    Date.UTC(
      hoy.getUTCFullYear(),
      hoy.getUTCMonth(),
      hoy.getUTCDate() - offsetLunes,
    ),
  );
  return { desde: formatearFecha(desde), hasta: formatearFecha(hoy) };
}

export function rangoMesActual(hoy: Date = new Date()): RangoFecha {
  const desde = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
  return { desde: formatearFecha(desde), hasta: formatearFecha(hoy) };
}

export function rangoEsteAnio(hoy: Date = new Date()): RangoFecha {
  const desde = new Date(Date.UTC(hoy.getUTCFullYear(), 0, 1));
  return { desde: formatearFecha(desde), hasta: formatearFecha(hoy) };
}

export function resolverRango(searchParams: {
  desde?: string;
  hasta?: string;
}): RangoFecha {
  const parsed = rangoFechaSchema.safeParse({
    desde: searchParams.desde,
    hasta: searchParams.hasta,
  });
  if (!parsed.success) {
    return rangoMesActual();
  }
  return parsed.data;
}
