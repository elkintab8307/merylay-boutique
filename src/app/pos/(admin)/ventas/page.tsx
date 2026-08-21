import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { EliminarVentaButton } from "./eliminar-venta-button";

const LIMITE = 50;

export default async function HistorialVentasPage() {
  const supabase = await createClient();
  const [{ data: ventas }, currentUser] = await Promise.all([
    supabase
      .from("pos_sales")
      .select("id, sale_number, created_at, payment_method, total")
      .order("created_at", { ascending: false })
      .limit(LIMITE),
    getCurrentProfile(),
  ]);

  const esAdmin =
    currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <Link
        href="/pos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al POS
      </Link>
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">
        Historial de ventas
      </h1>
      {ventas && ventas.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Número</TableHeaderCell>
              <TableHeaderCell>Método de pago</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
              {esAdmin && <TableHeaderCell>Acciones</TableHeaderCell>}
            </TableRow>
          </TableHeader>
          <tbody>
            {ventas.map((venta) => {
              const fecha = new Date(venta.created_at);
              return (
                <TableRow key={venta.id}>
                  <TableCell className="whitespace-nowrap">
                    {fecha.toLocaleDateString("es-CO")}
                    <span className="ml-1.5 text-brand-ciruela/60">
                      {fecha.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/pos/venta/${venta.id}`}
                      className="text-brand-rosa hover:underline"
                    >
                      {venta.sale_number}
                    </Link>
                  </TableCell>
                  <TableCell className="capitalize">{venta.payment_method}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatPrice(venta.total)}</TableCell>
                  {esAdmin && (
                    <TableCell>
                      <EliminarVentaButton id={venta.id} saleNumber={venta.sale_number} />
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <p className="text-brand-ciruela/70">Todavía no hay ventas registradas.</p>
      )}
    </div>
  );
}
