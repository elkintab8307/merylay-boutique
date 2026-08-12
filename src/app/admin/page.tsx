import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { inicioDelDiaBogota } from "@/lib/date/inicio-del-dia";
import { buildLowStockItems, obtenerUmbralStockBajo } from "@/lib/admin/low-stock";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const inicioHoy = inicioDelDiaBogota();

  const [
    { data: ordenesHoy, error: ordenesError },
    { data: ventasPosHoy, error: posError },
    { count: pedidosPendientes, error: pendientesError },
    { data: productos, error: productosError },
    { data: variantes, error: variantesError },
    umbralStockBajo,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", inicioHoy)
      .neq("status", "cancelado"),
    supabase.from("pos_sales").select("total").gte("created_at", inicioHoy),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendiente"),
    supabase.from("products").select("id, name, stock").eq("is_active", true),
    supabase
      .from("product_variants")
      .select("id, product_id, talla, color, stock"),
    obtenerUmbralStockBajo(),
  ]);

  const huboError =
    ordenesError || posError || pendientesError || productosError || variantesError;

  if (huboError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl text-brand-ciruela">Panel</h1>
        <p className="text-sm text-red-600">
          No se pudieron cargar las métricas.
        </p>
      </div>
    );
  }

  const ventasTienda = (ordenesHoy ?? []).reduce((sum, o) => sum + o.total, 0);
  const ventasPos = (ventasPosHoy ?? []).reduce((sum, v) => sum + v.total, 0);
  const ventasTotal = ventasTienda + ventasPos;

  // Solo los productos activos entran en la métrica: un producto descontinuado
  // suele quedar en stock 0 y ensuciaría el listado de stock bajo para siempre.
  const productosActivos = productos ?? [];
  const idsActivos = new Set(productosActivos.map((p) => p.id));
  const variantesActivas = (variantes ?? []).filter((v) =>
    idsActivos.has(v.product_id),
  );

  const stockBajoCompleto = buildLowStockItems(
    productosActivos,
    variantesActivas,
    umbralStockBajo,
  );
  const stockBajo = stockBajoCompleto.slice(0, 10);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Panel</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <p className="text-sm text-brand-ciruela/70">Ventas de hoy</p>
          <p className="font-heading text-2xl text-brand-rosa">
            {formatPrice(ventasTotal)}
          </p>
          <p className="mt-1 text-xs text-brand-ciruela/60">
            Tienda: {formatPrice(ventasTienda)} · POS: {formatPrice(ventasPos)}
          </p>
        </div>

        <Link
          href="/admin/pedidos?status=pendiente"
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm transition hover:border-brand-rosa hover:shadow-brand-md"
        >
          <p className="text-sm text-brand-ciruela/70">Pedidos pendientes</p>
          <p className="font-heading text-2xl text-brand-rosa">
            {pedidosPendientes ?? 0}
          </p>
        </Link>

        <Link
          href="/admin/informes/stock-bajo"
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm transition hover:border-brand-rosa hover:shadow-brand-md"
        >
          <p className="text-sm text-brand-ciruela/70">Stock bajo</p>
          <p className="font-heading text-2xl text-brand-rosa">
            {stockBajoCompleto.length}
          </p>
        </Link>
      </div>

      {stockBajo.length > 0 && (
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <h2 className="mb-3 font-heading text-lg text-brand-ciruela">
            Stock bajo
          </h2>
          <div className="flex flex-col divide-y divide-brand-rosa-claro/50 text-sm text-brand-ciruela">
            {stockBajo.map((item) => (
              <Link
                key={`${item.productId}-${item.variantLabel ?? ""}`}
                href={`/admin/productos/${item.productId}/editar`}
                className="flex justify-between py-2 hover:text-brand-rosa"
              >
                <span>
                  {item.productName}
                  {item.variantLabel ? ` (${item.variantLabel})` : ""}
                </span>
                <span>{item.stock} unidades</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
