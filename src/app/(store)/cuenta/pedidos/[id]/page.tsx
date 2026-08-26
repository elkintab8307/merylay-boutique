import { notFound, redirect } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { ReintentarPagoWompiButton } from "./reintentar-pago-wompi-button";

type ShippingAddress = {
  fullName?: string;
  phone?: string;
  address?: string;
  city?: string;
  notes?: string | null;
};

export default async function PedidoDetallePage({
  params,
  searchParams,
}: PageProps<"/cuenta/pedidos/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?redirectTo=/cuenta/pedidos/${id}`);
  }

  const { data: pedido } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!pedido) {
    notFound();
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("name_snapshot, qty, unit_price, line_total, image_id")
    .eq("order_id", pedido.id);

  const imageIds = (items ?? [])
    .map((i) => i.image_id)
    .filter((v): v is string => Boolean(v));
  const { data: imagenes } =
    imageIds.length > 0
      ? await supabase.from("product_images").select("id, url").in("id", imageIds)
      : { data: [] as { id: string; url: string }[] };
  const urlPorImagen = new Map((imagenes ?? []).map((img) => [img.id, img.url]));

  const confirmado = search.confirmado === "1";
  const direccion = pedido.shipping_address as ShippingAddress | null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      {confirmado && (
        <div className="mb-6 rounded-md border border-brand-oro bg-brand-rosa-claro/40 px-4 py-3 text-brand-ciruela">
          ¡Gracias por tu compra! Tu pedido fue confirmado.
        </div>
      )}
      <h1 className="mb-2 font-heading text-3xl text-brand-ciruela">
        Pedido {pedido.order_number}
      </h1>
      <p className="mb-8 text-sm text-brand-ciruela/60">
        Estado: {pedido.status} · Método de pago: {pedido.payment_method}
      </p>

      {pedido.status === "pendiente" && pedido.payment_method === "wompi" && (
        <ReintentarPagoWompiButton orderId={pedido.id} />
      )}

      <div className="mb-8 flex flex-col divide-y divide-brand-rosa-claro rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
        {(items ?? []).map((item, index) => {
          const miniatura = item.image_id ? urlPorImagen.get(item.image_id) : null;
          return (
            <div
              key={index}
              className="flex items-center justify-between py-2 text-sm text-brand-ciruela"
            >
              <span className="flex items-center gap-2">
                {miniatura && (
                  <span className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md border border-brand-rosa-claro">
                    <Image src={miniatura} alt="" fill className="object-cover" />
                  </span>
                )}
                {item.name_snapshot} × {item.qty}
              </span>
              <span>{formatPrice(item.line_total)}</span>
            </div>
          );
        })}
        <div className="flex justify-between pt-2 font-heading text-brand-rosa">
          <span>Total</span>
          <span>{formatPrice(pedido.total)}</span>
        </div>
      </div>

      {direccion && (
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 text-sm text-brand-ciruela shadow-brand-sm">
          <h2 className="mb-2 font-heading text-base">Envío</h2>
          <p>{direccion.fullName}</p>
          <p>{direccion.phone}</p>
          <p>
            {direccion.address}, {direccion.city}
          </p>
          {direccion.notes && <p className="text-brand-ciruela/60">{direccion.notes}</p>}
        </div>
      )}
    </main>
  );
}
