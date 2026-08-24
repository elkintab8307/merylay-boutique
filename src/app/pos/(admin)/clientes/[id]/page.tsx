import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { EditarClienteForm } from "./editar-cliente-form";
import { HistorialCompras, type MovimientoHistorial } from "./historial-compras";

export default async function ClienteDetallePage({
  params,
}: PageProps<"/pos/clientes/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: cliente } = await supabase
    .from("pos_customers")
    .select("id, nombre, telefono, cedula, direccion, profile_id")
    .eq("id", id)
    .single();

  if (!cliente) {
    notFound();
  }

  const { data: ventasPos } = await supabase
    .from("pos_sales")
    .select("id, created_at, total")
    .eq("customer_id", id)
    .order("created_at", { ascending: false });

  let pedidosTienda: { id: string; created_at: string; total: number }[] = [];
  const profileId = cliente.profile_id;
  const adminClient = profileId ? createAdminClient() : null;
  if (adminClient && profileId) {
    const { data } = await adminClient
      .from("orders")
      .select("id, created_at, total")
      .eq("user_id", profileId)
      .order("created_at", { ascending: false });
    pedidosTienda = data ?? [];
  }

  const ventasPosIds = (ventasPos ?? []).map((v) => v.id);
  const pedidosTiendaIds = pedidosTienda.map((p) => p.id);

  const [{ data: posItems }, { data: tiendaItems }] = await Promise.all([
    ventasPosIds.length > 0
      ? supabase
          .from("pos_sale_items")
          .select("sale_id, qty, unit_price, line_total, product_id, variant_id")
          .in("sale_id", ventasPosIds)
      : Promise.resolve({ data: [] as never[] }),
    adminClient && pedidosTiendaIds.length > 0
      ? adminClient
          .from("order_items")
          .select("order_id, name_snapshot, qty, unit_price, line_total")
          .in("order_id", pedidosTiendaIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  const productIds = (posItems ?? [])
    .map((i) => i.product_id)
    .filter((v): v is string => Boolean(v));
  const variantIds = (posItems ?? [])
    .map((i) => i.variant_id)
    .filter((v): v is string => Boolean(v));

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    variantIds.length > 0
      ? supabase.from("product_variants").select("id, talla, color").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; talla: string | null; color: string | null }[] }),
  ]);

  const productById = new Map((products ?? []).map((p) => [p.id, p.name]));
  const variantById = new Map((variants ?? []).map((v) => [v.id, v]));

  const historial: MovimientoHistorial[] = [
    ...(ventasPos ?? []).map((v) => ({
      id: v.id,
      tipo: "pos" as const,
      fecha: v.created_at,
      total: v.total,
      href: `/pos/venta/${v.id}`,
      productos: (posItems ?? [])
        .filter((item) => item.sale_id === v.id)
        .map((item) => {
          const variante = item.variant_id ? variantById.get(item.variant_id) : null;
          return {
            nombre: item.product_id ? (productById.get(item.product_id) ?? "Producto") : "Producto",
            varianteLabel: variante
              ? [variante.talla, variante.color].filter(Boolean).join(" / ") || null
              : null,
            qty: item.qty,
            lineTotal: item.line_total,
          };
        }),
    })),
    ...pedidosTienda.map((p) => ({
      id: p.id,
      tipo: "tienda" as const,
      fecha: p.created_at,
      total: p.total,
      href: `/admin/pedidos/${p.id}`,
      productos: (tiendaItems ?? [])
        .filter((item) => item.order_id === p.id)
        .map((item) => ({
          nombre: item.name_snapshot,
          varianteLabel: null,
          qty: item.qty,
          lineTotal: item.line_total,
        })),
    })),
  ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/pos/clientes"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a clientes
      </Link>
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">{cliente.nombre}</h1>

      <div className="mb-8">
        <EditarClienteForm
          id={cliente.id}
          clienteInicial={{
            nombre: cliente.nombre,
            telefono: cliente.telefono,
            cedula: cliente.cedula,
            direccion: cliente.direccion,
          }}
        />
      </div>

      <h2 className="mb-4 font-heading text-xl text-brand-ciruela">Historial de compras</h2>
      {historial.length === 0 ? (
        <p className="text-brand-ciruela/70">Este cliente todavía no tiene compras registradas.</p>
      ) : (
        <HistorialCompras historial={historial} />
      )}
    </div>
  );
}
