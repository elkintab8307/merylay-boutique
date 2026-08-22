import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/format";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { EditarClienteForm } from "./editar-cliente-form";

type MovimientoHistorial = {
  id: string;
  tipo: "pos" | "tienda";
  fecha: string;
  total: number;
  href: string;
};

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
  if (cliente.profile_id) {
    const adminClient = createAdminClient();
    const { data } = await adminClient
      .from("orders")
      .select("id, created_at, total")
      .eq("user_id", cliente.profile_id)
      .order("created_at", { ascending: false });
    pedidosTienda = data ?? [];
  }

  const historial: MovimientoHistorial[] = [
    ...(ventasPos ?? []).map((v) => ({
      id: v.id,
      tipo: "pos" as const,
      fecha: v.created_at,
      total: v.total,
      href: `/pos/venta/${v.id}`,
    })),
    ...pedidosTienda.map((p) => ({
      id: p.id,
      tipo: "tienda" as const,
      fecha: p.created_at,
      total: p.total,
      href: `/admin/pedidos/${p.id}`,
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Origen</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {historial.map((mov) => (
              <TableRow key={`${mov.tipo}-${mov.id}`}>
                <TableCell className="whitespace-nowrap">
                  {new Date(mov.fecha).toLocaleDateString("es-CO")}
                </TableCell>
                <TableCell>
                  <Link href={mov.href} className="text-brand-rosa hover:underline">
                    {mov.tipo === "pos" ? "POS" : "Tienda online"}
                  </Link>
                </TableCell>
                <TableCell>{formatPrice(mov.total)}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
