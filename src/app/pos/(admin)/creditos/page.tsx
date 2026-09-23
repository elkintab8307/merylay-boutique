import Link from "next/link";
import { Pencil } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { formatPrice } from "@/lib/format";
import { calcularEstadoCredito, type EstadoCredito } from "@/lib/pos/estado-credito";
import { rangoHoy } from "@/lib/informes/rango-fecha";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";

const ESTADO_LABEL: Record<EstadoCredito, string> = {
  pagado: "Pagado",
  al_dia: "Al día",
  vencido: "Vencido",
};

const ESTADO_VARIANT: Record<EstadoCredito, "success" | "warning" | "danger"> = {
  pagado: "success",
  al_dia: "warning",
  vencido: "danger",
};

export default async function CreditosPage({
  searchParams,
}: PageProps<"/pos/creditos">) {
  const { estado } = await searchParams;
  const supabase = await createClient();
  const hoy = rangoHoy().desde;

  // Solo admin/superadmin puede editar un credito (la base de datos tambien
  // lo exige); al resto no se le muestra el enlace.
  const currentUser = await getCurrentProfile();
  const puedeEditar =
    currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";

  const { data: ventas } = await supabase
    .from("pos_sales")
    .select("id, created_at, total, customer_id")
    .eq("payment_method", "credito")
    .order("created_at", { ascending: false });

  const saleIds = (ventas ?? []).map((v) => v.id);

  const customerIds = [...new Set((ventas ?? []).map((v) => v.customer_id).filter((id): id is string => Boolean(id)))];
  const { data: clientes } =
    customerIds.length > 0
      ? await supabase.from("pos_customers").select("id, nombre, telefono").in("id", customerIds)
      : { data: [] as { id: string; nombre: string; telefono: string }[] };
  const clientePorId = new Map((clientes ?? []).map((c) => [c.id, c]));

  const [{ data: pagos }, { data: cuotas }] = await Promise.all([
    saleIds.length > 0
      ? supabase.from("credit_payments").select("sale_id, amount").in("sale_id", saleIds)
      : Promise.resolve({ data: [] as { sale_id: string; amount: number }[] }),
    saleIds.length > 0
      ? supabase
          .from("credit_installments")
          .select("sale_id, status, due_date")
          .in("sale_id", saleIds)
      : Promise.resolve(
          {
            data: [] as {
              sale_id: string;
              status: "pendiente" | "parcial" | "pagada";
              due_date: string;
            }[],
          },
        ),
  ]);

  const pagadoPorVenta = new Map<string, number>();
  for (const pago of pagos ?? []) {
    pagadoPorVenta.set(pago.sale_id, (pagadoPorVenta.get(pago.sale_id) ?? 0) + pago.amount);
  }

  const cuotasPorVenta = new Map<string, { status: "pendiente" | "parcial" | "pagada"; dueDate: string }[]>();
  for (const cuota of cuotas ?? []) {
    const lista = cuotasPorVenta.get(cuota.sale_id) ?? [];
    lista.push({ status: cuota.status, dueDate: cuota.due_date });
    cuotasPorVenta.set(cuota.sale_id, lista);
  }

  const filas = (ventas ?? []).map((venta) => {
    const saldo = venta.total - (pagadoPorVenta.get(venta.id) ?? 0);
    const estadoCredito = calcularEstadoCredito(saldo, cuotasPorVenta.get(venta.id) ?? [], hoy);
    return { ...venta, saldo, estadoCredito };
  });

  const filtroEstado = typeof estado === "string" ? estado : "";
  const filasFiltradas = filtroEstado
    ? filas.filter((f) => f.estadoCredito === filtroEstado)
    : filas;

  return (
    <div className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="mb-8 font-heading text-3xl text-brand-ciruela">Créditos</h1>
      <div className="mb-4 flex gap-2">
        {(["", "al_dia", "vencido", "pagado"] as const).map((valor) => (
          <Link
            key={valor || "todos"}
            href={valor ? `/pos/creditos?estado=${valor}` : "/pos/creditos"}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              filtroEstado === valor
                ? "border-brand-rosa bg-brand-rosa text-brand-crema"
                : "border-brand-rosa-claro text-brand-ciruela"
            }`}
          >
            {valor ? ESTADO_LABEL[valor as EstadoCredito] : "Todos"}
          </Link>
        ))}
      </div>
      {filasFiltradas.length === 0 ? (
        <p className="text-brand-ciruela/70">No hay créditos para mostrar.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Cliente</TableHeaderCell>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Total</TableHeaderCell>
              <TableHeaderCell>Saldo</TableHeaderCell>
              <TableHeaderCell>Estado</TableHeaderCell>
              {puedeEditar && (
                <TableHeaderCell>
                  <span className="sr-only">Acciones</span>
                </TableHeaderCell>
              )}
            </TableRow>
          </TableHeader>
          <tbody>
            {filasFiltradas.map((venta) => (
              <TableRow key={venta.id}>
                <TableCell>
                  <Link href={`/pos/creditos/${venta.id}`} className="text-brand-rosa hover:underline">
                    {clientePorId.get(venta.customer_id ?? "")?.nombre ?? "-"}
                  </Link>
                  <p className="text-xs text-brand-ciruela/60">
                    {clientePorId.get(venta.customer_id ?? "")?.telefono ?? "-"}
                  </p>
                </TableCell>
                <TableCell>{new Date(venta.created_at).toLocaleDateString("es-CO")}</TableCell>
                <TableCell>{formatPrice(venta.total)}</TableCell>
                <TableCell>{formatPrice(venta.saldo)}</TableCell>
                <TableCell>
                  <Badge variant={ESTADO_VARIANT[venta.estadoCredito]}>
                    {ESTADO_LABEL[venta.estadoCredito]}
                  </Badge>
                </TableCell>
                {puedeEditar && (
                  <TableCell>
                    <Link
                      href={`/pos/creditos/${venta.id}/editar`}
                      className="inline-flex items-center gap-1 text-sm text-brand-rosa hover:underline"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Editar
                    </Link>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
