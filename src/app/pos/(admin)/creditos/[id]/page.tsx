import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Pencil } from "lucide-react";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/format";
import { calcularEstadoCredito, type EstadoCredito } from "@/lib/pos/estado-credito";
import { rangoHoy } from "@/lib/informes/rango-fecha";
import { urlImagenDeLinea } from "@/lib/pos/imagen-linea";
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

  // Solo admin/superadmin puede editar un credito (la base de datos tambien
  // lo exige); al resto no se le muestra el boton.
  const currentUser = await getCurrentProfile();
  const puedeEditar =
    currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";

  const { data: venta } = await supabase
    .from("pos_sales")
    .select("id, created_at, total, customer_id, payment_method")
    .eq("id", id)
    .single();

  if (!venta || venta.payment_method !== "credito") {
    notFound();
  }

  const { data: cliente } = venta.customer_id
    ? await supabase.from("pos_customers").select("nombre, telefono").eq("id", venta.customer_id).single()
    : { data: null };

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

  // Productos de la venta con su foto (la exacta que se vendio, aunque ya
  // este marcada como vendida en el catalogo).
  const { data: lineas } = await supabase
    .from("pos_sale_items")
    .select("id, qty, unit_price, line_total, product_id, variant_id, image_id")
    .eq("sale_id", id);
  const productIds = [...new Set((lineas ?? []).map((l) => l.product_id).filter((v): v is string => Boolean(v)))];
  const variantIds = [...new Set((lineas ?? []).map((l) => l.variant_id).filter((v): v is string => Boolean(v)))];
  const [{ data: productos }, { data: variantes }, { data: imagenes }] = await Promise.all([
    productIds.length > 0
      ? supabase.from("products").select("id, name").in("id", productIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    variantIds.length > 0
      ? supabase.from("product_variants").select("id, talla, color").in("id", variantIds)
      : Promise.resolve({ data: [] as { id: string; talla: string | null; color: string | null }[] }),
    productIds.length > 0
      ? supabase
          .from("product_images")
          .select("id, product_id, variant_id, url, is_primary, sort_order")
          .in("product_id", productIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            product_id: string;
            variant_id: string | null;
            url: string;
            is_primary: boolean;
            sort_order: number;
          }[],
        }),
  ]);
  const nombreProducto = new Map((productos ?? []).map((p) => [p.id, p.name]));
  const varianteLabel = new Map(
    (variantes ?? []).map((v) => [v.id, [v.talla, v.color].filter(Boolean).join(" / ")]),
  );

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
            {cliente?.nombre ?? "-"}
          </h1>
          <p className="text-sm text-brand-ciruela/70">{cliente?.telefono ?? "-"}</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={ESTADO_VARIANT[estadoCredito]}>{ESTADO_LABEL[estadoCredito]}</Badge>
          <PrintButton />
        </div>
      </div>

      {puedeEditar && (
        <Link
          href={`/pos/creditos/${venta.id}/editar`}
          className="mb-6 inline-flex items-center gap-2 rounded-md bg-brand-rosa px-4 py-2 text-sm font-medium text-brand-crema hover:bg-brand-rosa/90"
        >
          <Pencil className="h-4 w-4" />
          Editar crédito
        </Link>
      )}

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

      <h2 className="mb-4 font-heading text-xl text-brand-ciruela">Productos</h2>
      <ul className="mb-8 divide-y divide-brand-rosa-claro rounded-lg border border-brand-rosa-claro bg-white shadow-brand-sm">
        {(lineas ?? []).map((linea) => {
          const foto = urlImagenDeLinea(linea, imagenes ?? []);
          const nombre = nombreProducto.get(linea.product_id ?? "") ?? "Producto";
          const variante = linea.variant_id ? varianteLabel.get(linea.variant_id) : null;
          return (
            <li key={linea.id} className="flex items-center gap-3 p-3">
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md bg-brand-rosa-claro">
                {foto && <Image src={foto} alt={nombre} fill className="object-contain" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="break-words text-sm text-brand-ciruela">
                  {nombre}
                  {variante ? ` (${variante})` : ""}
                </p>
                <p className="text-xs text-brand-ciruela/60">
                  {linea.qty} × {formatPrice(linea.unit_price)}
                </p>
              </div>
              <p className="shrink-0 text-sm font-medium text-brand-ciruela">
                {formatPrice(linea.line_total)}
              </p>
            </li>
          );
        })}
      </ul>

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
