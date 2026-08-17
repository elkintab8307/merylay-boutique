import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import type { LocalCartItem } from "@/lib/cart/local-cart";
import { EditarVentaForm } from "./editar-venta-form";

export default async function EditarVentaPage({
  params,
}: PageProps<"/pos/venta/[id]/editar">) {
  const { id } = await params;

  const currentUser = await getCurrentProfile();
  const esAdmin =
    currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";
  if (!esAdmin) {
    notFound();
  }

  const supabase = await createClient();
  const { data: venta } = await supabase
    .from("pos_sales")
    .select("id, discount, payment_method")
    .eq("id", id)
    .single();

  if (!venta) {
    notFound();
  }

  const { data: items } = await supabase
    .from("pos_sale_items")
    .select("qty, unit_price, product_id, variant_id")
    .eq("sale_id", venta.id);

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
    // El stock "editable" de una linea ya vendida es el stock actual mas lo
    // que esta venta ya tiene reservado: esa cantidad sigue descontada del
    // stock real hasta que se guarde la edicion, asi que hay que sumarla de
    // vuelta para no subestimar el maximo disponible en el editor.
    const stockActual = variante?.stock ?? producto?.stock ?? 0;

    return {
      productId: item.product_id ?? "",
      variantId: item.variant_id,
      slug: "",
      name: varianteLabel ? `${nombreBase} (${varianteLabel})` : nombreBase,
      unitPrice: item.unit_price,
      qty: item.qty,
      imageUrl: null,
      stock: stockActual + item.qty,
    };
  });

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link
        href={`/pos/venta/${venta.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al recibo
      </Link>
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Editar venta</h1>
      <EditarVentaForm
        saleId={venta.id}
        itemsIniciales={itemsIniciales}
        discountInicial={venta.discount}
        paymentMethodInicial={venta.payment_method}
      />
    </div>
  );
}
