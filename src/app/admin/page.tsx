import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { inicioDelDiaBogota } from "@/lib/date/inicio-del-dia";
import { inicioDelMesBogota } from "@/lib/date/inicio-del-mes";
import { buildLowStockItems, obtenerUmbralStockBajo } from "@/lib/admin/low-stock";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { GraficaVentas } from "./informes/ventas/grafica-ventas";

function formatearVariacion(hoy: number, ayer: number): string | null {
  if (ayer === 0) return null;
  const variacion = ((hoy - ayer) / ayer) * 100;
  const signo = variacion >= 0 ? "+" : "";
  return `${signo}${variacion.toFixed(0)}% vs ayer`;
}

// Función auxiliar (fuera del cuerpo del componente) para que el compilador de
// React no marque la llamada impura a `Date.now()` como una infracción de
// pureza durante el render del Server Component.
function haceDias(dias: number): Date {
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
}

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const inicioHoy = inicioDelDiaBogota();
  const inicioAyer = inicioDelDiaBogota(haceDias(1));
  const inicioMes = inicioDelMesBogota();
  const hace6Dias = inicioDelDiaBogota(haceDias(6));

  const [
    { data: ordenesHoy, error: ordenesError },
    { data: ventasPosHoy, error: posError },
    { data: ordenesAyer, error: ordenesAyerError },
    { data: ventasPosAyer, error: posAyerError },
    { data: ordenesMes, error: ordenesMesError },
    { data: ventasPosMes, error: posMesError },
    { count: pedidosPendientes, error: pendientesError },
    { data: productos, error: productosError },
    { data: variantes, error: variantesError },
    umbralStockBajo,
    { data: serieVentas, error: serieError },
    { data: productosVendidos, error: productosVendidosError },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", inicioHoy)
      .neq("status", "cancelado"),
    supabase.from("pos_sales").select("total").gte("created_at", inicioHoy),
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", inicioAyer)
      .lt("created_at", inicioHoy)
      .neq("status", "cancelado"),
    supabase
      .from("pos_sales")
      .select("total")
      .gte("created_at", inicioAyer)
      .lt("created_at", inicioHoy),
    supabase
      .from("orders")
      .select("total")
      .gte("created_at", inicioMes)
      .neq("status", "cancelado"),
    supabase.from("pos_sales").select("total").gte("created_at", inicioMes),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "pendiente"),
    supabase.from("products").select("id, name, stock").eq("is_active", true),
    supabase
      .from("product_variants")
      .select("id, product_id, talla, color, stock"),
    obtenerUmbralStockBajo(),
    supabase.rpc("informe_ventas_serie", { p_desde: hace6Dias, p_hasta: inicioHoy }),
    supabase.rpc("informe_productos_vendidos", {
      p_desde: hace6Dias,
      p_hasta: inicioHoy,
      p_limit: 5,
    }),
  ]);

  const huboError =
    ordenesError ||
    posError ||
    ordenesAyerError ||
    posAyerError ||
    ordenesMesError ||
    posMesError ||
    pendientesError ||
    productosError ||
    variantesError ||
    serieError ||
    productosVendidosError;

  if (huboError) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-2xl text-brand-ciruela">Panel</h1>
        <p className="text-sm text-red-600">No se pudieron cargar las métricas.</p>
      </div>
    );
  }

  const sumar = (filas: { total: number }[] | null) =>
    (filas ?? []).reduce((sum, f) => sum + f.total, 0);

  const ventasTienda = sumar(ordenesHoy);
  const ventasPos = sumar(ventasPosHoy);
  const ventasTotal = ventasTienda + ventasPos;
  const ventasAyerTotal = sumar(ordenesAyer) + sumar(ventasPosAyer);
  const ventasMesTotal = sumar(ordenesMes) + sumar(ventasPosMes);
  const variacionTexto = formatearVariacion(ventasTotal, ventasAyerTotal);

  const productosActivos = productos ?? [];
  const idsActivos = new Set(productosActivos.map((p) => p.id));
  const variantesActivas = (variantes ?? []).filter((v) => idsActivos.has(v.product_id));

  const stockBajoCompleto = buildLowStockItems(productosActivos, variantesActivas, umbralStockBajo);
  const stockBajo = stockBajoCompleto.slice(0, 10);

  const porFecha = new Map<string, { fecha: string; tienda: number; pos: number }>();
  for (const fila of serieVentas ?? []) {
    const entry = porFecha.get(fila.fecha) ?? { fecha: fila.fecha, tienda: 0, pos: 0 };
    if (fila.canal === "tienda") entry.tienda = fila.monto;
    if (fila.canal === "pos") entry.pos = fila.monto;
    porFecha.set(fila.fecha, entry);
  }
  const datosGrafica = Array.from(porFecha.values());

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl text-brand-ciruela">Panel</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <p className="text-sm text-brand-ciruela/70">Ventas de hoy</p>
          <p className="font-heading text-2xl text-brand-rosa">{formatPrice(ventasTotal)}</p>
          {variacionTexto && (
            <p className="mt-1 text-xs text-brand-ciruela/60">{variacionTexto}</p>
          )}
        </div>

        <Link
          href="/admin/pedidos?status=pendiente"
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm transition hover:border-brand-rosa hover:shadow-brand-md"
        >
          <p className="text-sm text-brand-ciruela/70">Pedidos pendientes</p>
          <p className="font-heading text-2xl text-brand-rosa">{pedidosPendientes ?? 0}</p>
        </Link>

        <Link
          href="/admin/informes/stock-bajo"
          className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm transition hover:border-brand-rosa hover:shadow-brand-md"
        >
          <p className="text-sm text-brand-ciruela/70">Stock bajo</p>
          <p className="font-heading text-2xl text-brand-rosa">{stockBajoCompleto.length}</p>
        </Link>

        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <p className="text-sm text-brand-ciruela/70">Ventas del mes</p>
          <p className="font-heading text-2xl text-brand-rosa">{formatPrice(ventasMesTotal)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {datosGrafica.length > 0 && (
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <h2 className="mb-3 font-heading text-lg text-brand-ciruela">
              Ventas — últimos 7 días
            </h2>
            <GraficaVentas datos={datosGrafica} />
          </div>
        )}

        {(productosVendidos ?? []).length > 0 && (
          <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
            <h2 className="mb-3 font-heading text-lg text-brand-ciruela">
              Productos más vendidos (7 días)
            </h2>
            <ul className="flex flex-col divide-y divide-brand-rosa-claro/50 text-sm text-brand-ciruela">
              {(productosVendidos ?? []).map((p) => (
                <li key={p.product_id} className="flex justify-between py-2">
                  <span>{p.nombre}</span>
                  <span>{Number(p.qty)} unidades</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {stockBajo.length > 0 && (
        <div>
          <h2 className="mb-3 font-heading text-lg text-brand-ciruela">Stock bajo</h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Producto</TableHeaderCell>
                <TableHeaderCell>Stock</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <tbody>
              {stockBajo.map((item) => (
                <TableRow key={`${item.productId}-${item.variantLabel ?? ""}`}>
                  <TableCell>
                    <Link
                      href={`/admin/productos/${item.productId}/editar`}
                      className="hover:text-brand-rosa"
                    >
                      {item.productName}
                      {item.variantLabel ? ` (${item.variantLabel})` : ""}
                    </Link>
                  </TableCell>
                  <TableCell>{item.stock} unidades</TableCell>
                </TableRow>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </div>
  );
}
