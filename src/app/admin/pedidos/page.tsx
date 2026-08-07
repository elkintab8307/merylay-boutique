import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ESTADO_PEDIDO_LABELS, estadoPedidoSchema } from "@/lib/validation/pedido";

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
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Pedido</th>
              <th className="py-2">Cliente</th>
              <th className="py-2">Estado</th>
              <th className="py-2">Total</th>
              <th className="py-2">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {(pedidos ?? []).map((pedido) => {
              const direccion = pedido.shipping_address as ShippingAddress | null;
              return (
                <tr key={pedido.id} className="border-b border-brand-rosa-claro/50">
                  <td className="py-2">
                    <Link
                      href={`/admin/pedidos/${pedido.id}`}
                      className="text-brand-rosa hover:underline"
                    >
                      {pedido.order_number}
                    </Link>
                  </td>
                  <td className="py-2 text-brand-ciruela/70">
                    {direccion?.fullName ?? "-"}
                  </td>
                  <td className="py-2">
                    {ESTADO_PEDIDO_LABELS[pedido.status] ?? pedido.status}
                  </td>
                  <td className="py-2">{formatPrice(pedido.total)}</td>
                  <td className="py-2 text-brand-ciruela/70">
                    {new Date(pedido.created_at).toLocaleDateString("es-CO")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
