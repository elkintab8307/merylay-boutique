import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/format";
import { calcularEstadoCredito, type EstadoCredito } from "@/lib/pos/estado-credito";
import { rangoHoy } from "@/lib/informes/rango-fecha";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableRow, TableCell, TableHeaderCell } from "@/components/ui/table";
import { PrintButton } from "@/app/pos/(admin)/venta/[id]/print-button";
import { AbonoForm } from "./abono-form";

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

const ESTADO_CUOTA_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  parcial: "Parcial",
  pagada: "Pagada",
};

export default async function CreditoDetallePage({
  params,
}: PageProps<"/pos/creditos/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: venta } = await supabase
    .from("pos_sales")
    .select(
      "id, created_at, total, credit_customer_name, credit_customer_phone, payment_method",
    )
    .eq("id", id)
    .single();

  if (!venta || venta.payment_method !== "credito") {
    notFound();
  }

  const [{ data: cuotas }, { data: pagos }] = await Promise.all([
    supabase
      .from("credit_installments")
      .select("id, numero, due_date, amount, paid_amount, status")
      .eq("sale_id", id)
      .order("numero"),
    supabase
      .from("credit_payments")
      .select("id, amount, payment_method, created_at, staff_id")
      .eq("sale_id", id)
      .order("created_at", { ascending: false }),
  ]);

  const staffIds = [...new Set((pagos ?? []).map((p) => p.staff_id))];
  const adminClient = createAdminClient();
  const { data: staff } =
    staffIds.length > 0
      ? await adminClient.from("profiles").select("id, username").in("id", staffIds)
      : { data: [] as { id: string; username: string }[] };
  const staffById = new Map((staff ?? []).map((s) => [s.id, s.username]));

  const totalPagado = (pagos ?? []).reduce((sum, p) => sum + p.amount, 0);
  const saldo = venta.total - totalPagado;
  const hoy = rangoHoy().desde;
  const estadoCredito = calcularEstadoCredito(
    saldo,
    (cuotas ?? []).map((c) => ({ status: c.status, dueDate: c.due_date })),
    hoy,
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link
        href="/pos/creditos"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a créditos
      </Link>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-heading text-3xl text-brand-ciruela">
            {venta.credit_customer_name}
          </h1>
          <p className="text-sm text-brand-ciruela/70">{venta.credit_customer_phone}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={ESTADO_VARIANT[estadoCredito]}>{ESTADO_LABEL[estadoCredito]}</Badge>
          <PrintButton />
        </div>
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <p className="text-sm text-brand-ciruela/70">Total de la venta</p>
          <p className="font-heading text-2xl text-brand-ciruela">{formatPrice(venta.total)}</p>
        </div>
        <div className="rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <p className="text-sm text-brand-ciruela/70">Saldo pendiente</p>
          <p className="font-heading text-2xl text-brand-rosa">{formatPrice(saldo)}</p>
        </div>
      </div>

      <h2 className="mb-4 font-heading text-xl text-brand-ciruela">Cuotas</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHeaderCell>#</TableHeaderCell>
            <TableHeaderCell>Fecha</TableHeaderCell>
            <TableHeaderCell>Monto</TableHeaderCell>
            <TableHeaderCell>Pagado</TableHeaderCell>
            <TableHeaderCell>Estado</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <tbody>
          {(cuotas ?? []).map((cuota) => (
            <TableRow key={cuota.id}>
              <TableCell>{cuota.numero}</TableCell>
              <TableCell>{cuota.due_date}</TableCell>
              <TableCell>{formatPrice(cuota.amount)}</TableCell>
              <TableCell>{formatPrice(cuota.paid_amount)}</TableCell>
              <TableCell>{ESTADO_CUOTA_LABEL[cuota.status]}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </Table>

      <h2 className="mb-4 mt-8 font-heading text-xl text-brand-ciruela">Abonos</h2>
      {(pagos ?? []).length === 0 ? (
        <p className="mb-4 text-sm text-brand-ciruela/70">Todavía no hay abonos registrados.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHeaderCell>Fecha</TableHeaderCell>
              <TableHeaderCell>Monto</TableHeaderCell>
              <TableHeaderCell>Método</TableHeaderCell>
              <TableHeaderCell>Recibido por</TableHeaderCell>
            </TableRow>
          </TableHeader>
          <tbody>
            {(pagos ?? []).map((pago) => (
              <TableRow key={pago.id}>
                <TableCell>{new Date(pago.created_at).toLocaleString("es-CO")}</TableCell>
                <TableCell>{formatPrice(pago.amount)}</TableCell>
                <TableCell className="capitalize">{pago.payment_method}</TableCell>
                <TableCell>{staffById.get(pago.staff_id) ?? "-"}</TableCell>
              </TableRow>
            ))}
          </tbody>
        </Table>
      )}

      {saldo > 0 && (
        <div className="mt-8 rounded-lg border border-brand-rosa-claro bg-white p-4 shadow-brand-sm">
          <h2 className="mb-4 font-heading text-xl text-brand-ciruela">Registrar abono</h2>
          <AbonoForm saleId={venta.id} />
        </div>
      )}
    </div>
  );
}
