import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

const LIMITE = 50;

export default async function HistorialVentasPage() {
  const supabase = await createClient();
  const { data: ventas } = await supabase
    .from("pos_sales")
    .select("id, sale_number, created_at, payment_method, total")
    .order("created_at", { ascending: false })
    .limit(LIMITE);

  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
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
            </TableRow>
          </TableHeader>
          <tbody>
            {ventas.map((venta) => (
              <TableRow key={venta.id}>
                <TableCell>{new Date(venta.created_at).toLocaleString("es-CO")}</TableCell>
                <TableCell>
                  <Link href={`/pos/venta/${venta.id}`} className="text-brand-rosa hover:underline">
                    {venta.sale_number}
                  </Link>
                </TableCell>
                <TableCell>{venta.payment_method}</TableCell>
                <TableCell>{formatPrice(venta.total)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      ) : (
        <p className="text-brand-ciruela/70">Todavía no hay ventas registradas.</p>
      )}
    </div>
  );
}
