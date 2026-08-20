import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { PrintButton } from "./print-button";

export default async function ReciboVentaPage({
  params,
}: PageProps<"/pos/venta/[id]">) {
  const { id } = await params;
  const supabase = await createClient();
  const currentUser = await getCurrentProfile();
  const esAdmin =
    currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";

  const { data: venta } = await supabase
    .from("pos_sales")
    .select("*")
    .eq("id", id)
    .single();

  if (!venta) {
    notFound();
  }

  const esCredito = venta.payment_method === "credito";

  const [{ data: items }, { data: abonoInicial }, { count: numCuotas }] = await Promise.all([
    supabase
      .from("pos_sale_items")
      .select("qty, unit_price, line_total, product_id, variant_id")
      .eq("sale_id", venta.id),
    esCredito
      ? supabase
          .from("credit_payments")
          .select("amount, payment_method")
          .eq("sale_id", venta.id)
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    esCredito
      ? supabase
          .from("credit_installments")
          .select("id", { count: "exact", head: true })
          .eq("sale_id", venta.id)
      : Promise.resolve({ count: null }),
  ]);

  const productIds = (items ?? [])
    .map((i) => i.product_id)
    .filter((v): v is string => Boolean(v));
  const variantIds = (items ?? [])
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v));

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    variantIds.length > 0
      ? supabase
          .from("product_variants")
          .select("id, talla, color")
          .in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; talla: string | null; color: string | null }[] }),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p.name]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  return (
    <div className="mx-auto max-w-md px-6 py-12">
      <Link
        href="/pos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al POS
      </Link>
      <div
        id="receipt-imprimible"
        className="flex flex-col gap-4 rounded-lg border border-brand-rosa-claro bg-white p-6 shadow-brand-sm"
      >
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="font-script text-2xl text-brand-rosa">MeryLay Boutique</span>
          <span className="text-xs text-brand-ciruela/70">Inspiración Femenina</span>
        </div>
        <div className="text-sm text-brand-ciruela">
          <p>Venta: {venta.sale_number}</p>
          <p>Fecha: {new Date(venta.created_at).toLocaleString("es-CO")}</p>
          <p>Método de pago: {venta.payment_method}</p>
        </div>
        {esCredito && (
          <div className="flex flex-col gap-1 border-y border-brand-rosa-claro py-2 text-sm text-brand-ciruela">
            <p className="font-heading text-brand-ciruela">Crédito</p>
            <p>Cliente: {venta.credit_customer_name}</p>
            <p>Teléfono: {venta.credit_customer_phone}</p>
            <p>Cuotas: {numCuotas ?? 0}</p>
            {abonoInicial ? (
              <p>
                Abono inicial: {formatPrice(abonoInicial.amount)} (
                <span className="capitalize">{abonoInicial.payment_method}</span>)
              </p>
            ) : (
              <p>Abono inicial: ninguno</p>
            )}
          </div>
        )}
        <div className="flex flex-col divide-y divide-brand-rosa-claro border-y border-brand-rosa-claro py-2 text-sm text-brand-ciruela">
          {(items ?? []).map((item, index) => {
            const nombre = item.product_id
              ? (productById.get(item.product_id) ?? "Producto")
              : "Producto";
            const variante = item.variant_id ? variantById.get(item.variant_id) : null;
            const varianteLabel = variante
              ? [variante.talla, variante.color].filter(Boolean).join(" / ")
              : null;
            return (
              <div key={index} className="flex justify-between py-1">
                <span>
                  {nombre}
                  {varianteLabel ? ` (${varianteLabel})` : ""} × {item.qty}
                </span>
                <span>{formatPrice(item.line_total)}</span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col gap-1 text-sm text-brand-ciruela">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatPrice(venta.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Descuento</span>
            <span>-{formatPrice(venta.discount)}</span>
          </div>
          <div className="flex justify-between font-heading text-lg text-brand-rosa">
            <span>Total</span>
            <span>{formatPrice(venta.total)}</span>
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-center gap-3">
        <PrintButton />
        {esAdmin && (
          <Link
            href={`/pos/venta/${venta.id}/editar`}
            className="inline-flex items-center rounded-md border border-brand-rosa-claro px-4 py-2 text-sm text-brand-ciruela hover:bg-brand-rosa-claro/30"
          >
            Editar venta
          </Link>
        )}
      </div>
    </div>
  );
}
