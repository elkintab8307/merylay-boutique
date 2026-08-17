import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ESTADO_PEDIDO_LABELS, estadoPedidoSchema } from "@/lib/validation/pedido";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type ShippingAddress = { fullName?: string };

export default async function AdminPedidosPage({
  searchParams,
}: PageProps<"/admin/pedidos">) {
  const { status } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("orders")
    .select("id, order_number, status, total, created_at, shipping_address")
    .order("created_at", { ascending: false });

  // El filtro viene de la URL: si no es un estado válido simplemente no filtramos,
  // en vez de mandar un literal inválido a Postgres y romper la página.
  const parsedStatus = estadoPedidoSchema.safeParse(status);
  if (parsedStatus.success) {
    query = query.eq("status", parsedStatus.data);
  }

  const { data: pedidos, error } = await query;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Pedidos</h1>
      {error ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los pedidos.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Pedido</TableHeaderCell>
              <TableHeaderCell>Cliente</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
              <TableHeaderCell>Fecha</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(pedidos ?? []).map((pedido) => {
              const direccion = pedido.shipping_address as ShippingAddress | null;
              const estadoVariant =
                pedido.status === "entregado" || pedido.status === "pagado"
                  ? ("success" as const)
                  : pedido.status === "cancelado"
                    ? ("danger" as const)
                    : ("warning" as const);
              return (
                <TableRow key={pedido.id}>
                  <TableCell>
                    <Link
                      href={`/admin/pedidos/${pedido.id}`}
                      className="text-brand-rosa hover:underline"
                    >
                      {pedido.order_number}
                    </Link>
                  </TableCell>
                  <TableCell className="text-brand-ciruela/70">
                    {direccion?.fullName ?? "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={estadoVariant}>
                      {ESTADO_PEDIDO_LABELS[pedido.status] ?? pedido.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{formatPrice(pedido.total)}</TableCell>
                  <TableCell className="text-brand-ciruela/70">
                    {new Date(pedido.created_at).toLocaleDateString("es-CO")}
                  </TableCell>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      )}
    </div>
  );
}
