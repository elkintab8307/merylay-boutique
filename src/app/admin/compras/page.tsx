import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { Button } from "@/components/ui/button";

export default async function ComprasPage() {
  const supabase = await createClient();
  const { data: compras, error } = await supabase
    .from("purchases")
    .select("id, purchase_date, supplier_id, purchase_items(line_total)")
    .order("purchase_date", { ascending: false });

  const { data: proveedores } = await supabase.from("suppliers").select("id, name");
  const proveedorNombreById = new Map((proveedores ?? []).map((p) => [p.id, p.name]));

  const totalPorCompra = new Map<string, number>();
  for (const compra of compras ?? []) {
    const total = (compra.purchase_items ?? []).reduce(
      (sum, item) => sum + item.line_total,
      0,
    );
    totalPorCompra.set(compra.id, total);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl text-brand-ciruela">Compras</h1>
        <div className="flex gap-3">
          <Link href="/admin/compras/proveedores">
            <Button className="bg-white text-brand-rosa border border-brand-rosa hover:bg-brand-rosa-claro/30">
              Proveedores
            </Button>
          </Link>
          <Link href="/admin/compras/nueva">
            <Button className="bg-brand-rosa text-brand-crema hover:bg-brand-rosa/90">
              Nueva compra
            </Button>
          </Link>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-red-600">No se pudieron cargar las compras.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-brand-rosa-claro text-left text-brand-ciruela">
              <th className="py-2">Fecha</th>
              <th className="py-2">Proveedor</th>
              <th className="py-2">Total</th>
            </tr>
          </thead>
          <tbody>
            {(compras ?? []).map((compra) => (
              <tr key={compra.id} className="border-b border-brand-rosa-claro/50">
                <td className="py-2">{compra.purchase_date}</td>
                <td className="py-2">
                  {proveedorNombreById.get(compra.supplier_id) ?? "-"}
                </td>
                <td className="py-2">{formatPrice(totalPorCompra.get(compra.id) ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
