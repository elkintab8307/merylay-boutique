import { rangoFechaSchema } from "@/lib/validation/informes";

export type RangoFecha = { desde: string; hasta: string };

const ZONA_HORARIA = "America/Bogota";

function partesBogota(fecha: Date): { anio: number; mes: number; dia: number } {
  const formateador = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const partes = formateador.formatToParts(fecha);
  const obtener = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value);
  return { anio: obtener("year"), mes: obtener("month"), dia: obtener("day") };
}

function formatearFecha(anio: number, mes: number, dia: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

export function rangoHoy(hoy: Date = new Date()): RangoFecha {
  const { anio, mes, dia } = partesBogota(hoy);
  const fecha = formatearFecha(anio, mes, dia);
  return { desde: fecha, hasta: fecha };
}

export function rangoEstaSemana(hoy: Date = new Date()): RangoFecha {
  const { anio, mes, dia } = partesBogota(hoy);
  const fechaCalendario = new Date(Date.UTC(anio, mes - 1, dia));
  const diaSemana = fechaCalendario.getUTCDay();
  const offsetLunes = diaSemana === 0 ? 6 : diaSemana - 1;
  const desde = new Date(Date.UTC(anio, mes - 1, dia - offsetLunes));
  return {
    desde: formatearFecha(
      desde.getUTCFullYear(),
      desde.getUTCMonth() + 1,
      desde.getUTCDate(),
    ),
    hasta: formatearFecha(anio, mes, dia),
  };
}

export function rangoMesActual(hoy: Date = new Date()): RangoFecha {
  const { anio, mes, dia } = partesBogota(hoy);
  return { desde: formatearFecha(anio, mes, 1), hasta: formatearFecha(anio, mes, dia) };
}

export function rangoEsteAnio(hoy: Date = new Date()): RangoFecha {
  const { anio, mes, dia } = partesBogota(hoy);
  return { desde: formatearFecha(anio, 1, 1), hasta: formatearFecha(anio, mes, dia) };
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
