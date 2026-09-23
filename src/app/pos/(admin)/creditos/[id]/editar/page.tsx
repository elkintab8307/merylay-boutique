import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { cargarVentaEditable } from "@/lib/pos/cargar-venta-editable";
import { EditarVentaForm } from "@/app/pos/(admin)/venta/[id]/editar/editar-venta-form";

export default async function EditarCreditoPage({
  params,
}: PageProps<"/pos/creditos/[id]/editar">) {
  const { id } = await params;

  // Solo admin/superadmin: la base de datos tambien lo exige (update_pos_sale).
  const currentUser = await getCurrentProfile();
  const esAdmin =
    currentUser?.profile.role === "admin" || currentUser?.profile.role === "superadmin";
  if (!esAdmin) {
    notFound();
  }

  const supabase = await createClient();
  const datos = await cargarVentaEditable(supabase, id);

  if (!datos) {
    notFound();
  }

  // Una venta que no es credito se edita desde Ventas.
  if (datos.venta.payment_method !== "credito") {
    redirect(`/pos/venta/${id}/editar`);
  }

  const { venta, itemsIniciales, cliente, abonado } = datos;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-12">
      <Link
        href={`/pos/creditos/${venta.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al crédito
      </Link>
      <div className="mb-6 sm:mb-8">
        <h1 className="font-heading text-3xl text-brand-ciruela">Editar crédito</h1>
        <p className="text-sm text-brand-ciruela/70">
          {cliente?.nombre ?? "-"} · {cliente?.telefono ?? "-"}
        </p>
      </div>
      <EditarVentaForm
        saleId={venta.id}
        itemsIniciales={itemsIniciales}
        discountInicial={venta.discount}
        paymentMethodInicial={venta.payment_method}
        clienteInicial={cliente}
        credito={{ abonado, saldo: venta.total - abonado }}
        destino="credito"
      />
    </div>
  );
}
