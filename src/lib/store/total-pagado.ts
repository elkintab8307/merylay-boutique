const ESTADOS_PAGADOS = new Set(["pagado", "enviado", "entregado"]);

export function calcularTotalPagado(
  pedidos: { status: string; total: number }[],
): number {
  return pedidos
    .filter((pedido) => ESTADOS_PAGADOS.has(pedido.status))
    .reduce((suma, pedido) => suma + pedido.total, 0);
}
