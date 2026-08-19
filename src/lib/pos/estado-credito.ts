export type EstadoCredito = "pagado" | "vencido" | "al_dia";

export function calcularEstadoCredito(
  saldo: number,
  cuotas: { status: "pendiente" | "parcial" | "pagada"; dueDate: string }[],
  hoy: string,
): EstadoCredito {
  if (saldo <= 0) return "pagado";
  const hayVencida = cuotas.some((c) => c.status !== "pagada" && c.dueDate < hoy);
  return hayVencida ? "vencido" : "al_dia";
}
