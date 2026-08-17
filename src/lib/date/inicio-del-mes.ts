export function inicioDelMesBogota(ahora: Date = new Date()): string {
  const fecha = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Bogota",
    year: "numeric",
    month: "2-digit",
  }).format(ahora);

  return `${fecha}-01T00:00:00-05:00`;
}
