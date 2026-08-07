export function inicioDelDiaBogota(ahora: Date = new Date()): string {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);

  return `${fecha}T00:00:00-05:00`;
}
