import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import { PedidoEditarForm } from "./pedido-editar-form";

export default async function EditarPedidoPage({
  params,
}: PageProps<"/admin/pedidos/[id]/editar">) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: pedido } = await supabase
    .from("orders")
    .select("id, order_number, payment_method, wompi_transaction_id")
    .eq("id", id)
    .single();

  if (!pedido) {
    notFound();
  }

  const pedidoEsWompiSinConfirmar =
    pedido.payment_method === "wompi" && !pedido.wompi_transaction_id;

  const { data: items } = await supabase
    .from("order_items")
    .select("qty, unit_price, product_id, variant_id, image_id")
    .eq("order_id", pedido.id);

  const productIds = (items ?? [])
    .map((i) => i.product_id)
    .filter((v): v is string => Boolean(v));
  const variantIds = (items ?? [])
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v));

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name, stock").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; stock: number }[] }),
    variantIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, talla, color, stock")
          .in("id", variantIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            talla: string | null;
            color: string | null;
            stock: number;
          }[],
        }),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const itemsIniciales: LocalCartItem[] = (items ?? []).map((item) => {
    const producto = item.product_id ? productById.get(item.product_id) : undefined;
    const variante = item.variant_id ? variantById.get(item.variant_id) : undefined;
    const varianteLabel = variante
      ? [variante.talla, variante.color].filter(Boolean).join(" / ")
      : null;
    const nombreBase = producto?.name ?? "Producto";
    // Mismo criterio que /pos/venta/[id]/editar: el stock "editable" de
    // una linea ya vendida es el stock actual mas lo que este pedido ya
    // tiene reservado.
    const stockActual = variante?.stock ?? producto?.stock ?? 0;

    return {
      productId: item.product_id ?? "",
      variantId: item.variant_id,
      imageId: item.image_id,
      slug: "",
      name: varianteLabel ? `${nombreBase} (${varianteLabel})` : nombreBase,
      unitPrice: item.unit_price,
      qty: item.qty,
      imageUrl: null,
      stock: stockActual + item.qty,
    };
  });

  return (
    <main className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">
        Editar pedido {pedido.order_number}
      </h1>
      {pedidoEsWompiSinConfirmar ? (
        <div className="rounded-lg border border-brand-oro bg-brand-oro/10 p-4 text-sm text-brand-ciruela">
          <p className="font-semibold">Este pedido todavía no se puede editar</p>
          <p>
            Se pagó con Wompi y el pago todavía no se ha confirmado — el stock
            de sus productos no se ha descontado todavía. Espera a que se
            confirme el pago o cancela el pedido antes de editarlo.
          </p>
        </div>
      ) : (
        <>
          {pedido.payment_method === "wompi" && (
            <div className="rounded-lg border border-brand-oro bg-brand-oro/10 p-4 text-sm text-brand-ciruela">
              <p className="font-semibold">Este pedido se pagó con Wompi</p>
              <p>
                El cliente ya fue cobrado el total original. Editar los productos
                no ajusta ese cobro automáticamente — si el nuevo total difiere
                del que se cobró, resuélvelo por fuera del sistema (reembolso o
                cobro adicional a través de Wompi).
              </p>
            </div>
          )}
          <PedidoEditarForm orderId={pedido.id} itemsIniciales={itemsIniciales} />
        </>
      )}
    </main>
  );
}
