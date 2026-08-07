import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { EstadoPedidoSelect } from "../estado-pedido-select";

type ShippingAddress = {
  fullName?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string | null;
};

export default async function AdminPedidoDetallePage({
  params,
}: PageProps<"/admin/pedidos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: pedido, error: pedidoError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (pedidoError && pedidoError.code !== "PGRST116") {
    return (
      <div className="flex flex-col gap-6">
        <p className="text-sm text-red-600">No se pudo cargar el pedido.</p>
      </div>
    );
  }

  if (!pedido) {
    notFound();
  }

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("name_snapshot, qty, unit_price, line_total")
    .eq("order_id", pedido.id);

  const direccion = pedido.shipping_address as ShippingAddress | null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl text-brand-ciruela">
          Pedido {pedido.order_number}
        </h1>
        <p className="text-sm text-brand-ciruela/60">
          Método de pago: {pedido.payment_method ?? "-"} ·{" "}
          {new Date(pedido.created_at).toLocaleString("es-CO")}
        </p>
      </div>

      <EstadoPedidoSelect orderId={pedido.id} estadoActual={pedido.status} />

      <div className="flex flex-col divide-y divide-brand-rosa-claro rounded-lg border border-brand-rosa-claro bg-white p-4">
        {itemsError ? (
          <p className="text-sm text-red-600">
            No se pudieron cargar los detalles del pedido.
          </p>
        ) : (
          <>
            {(items ?? []).map((item, index) => (
              <div
                key={index}
                className="flex justify-between py-2 text-sm text-brand-ciruela"
              >
                <span>
                  {item.name_snapshot} × {item.qty}
                </span>
                <span>{formatPrice(item.line_total)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 font-heading text-brand-rosa">
              <span>Total</span>
              <span>{formatPrice(pedido.total)}</span>
            </div>
          </>
        )}
      </div>

      {direccion && (
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 text-sm text-brand-ciruela">
          <h2 className="mb-2 font-heading text-base">Envío</h2>
          <p>{direccion.fullName}</p>
          <p>{direccion.phone}</p>
          <p>
            {direccion.address}, {direccion.city}
          </p>
          {direccion.notes && (
            <p className="text-brand-ciruela/60">{direccion.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
