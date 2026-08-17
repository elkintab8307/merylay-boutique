import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";

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
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
                <th className="py-2">Fecha</th>
                <th className="py-2">Número</th>
                <th className="py-2">Método de pago</th>
                <th className="py-2">Total</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((venta) => (
                <tr key={venta.id} className="border-b border-brand-rosa-claro/50">
                  <td className="py-2">
                    {new Date(venta.created_at).toLocaleString("es-CO")}
                  </td>
                  <td className="py-2">
                    <Link
                      href={`/pos/venta/${venta.id}`}
                      className="text-brand-rosa hover:underline"
                    >
                      {venta.sale_number}
                    </Link>
                  </td>
                  <td className="py-2">{venta.payment_method}</td>
                  <td className="py-2">{formatPrice(venta.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-brand-ciruela/70">Todavía no hay ventas registradas.</p>
      )}
    </div>
  );
}
