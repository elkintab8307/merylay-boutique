import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { cargarVentaEditable } from "@/lib/pos/cargar-venta-editable";
import { EditarVentaForm } from "./editar-venta-form";

export default async function EditarVentaPage({
  params,
}: PageProps<"/pos/venta/[id]/editar">) {
  const { id } = await params;

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

  // Los creditos se editan desde la seccion de Creditos (ahi vuelve el
  // usuario al guardar y ve el saldo y las cuotas).
  if (datos.venta.payment_method === "credito") {
    redirect(`/pos/creditos/${id}/editar`);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-12">
      <Link
        href={`/pos/venta/${datos.venta.id}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-ciruela hover:text-brand-rosa"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver al recibo
      </Link>
      <h1 className="mb-6 font-heading text-3xl text-brand-ciruela sm:mb-8">Editar venta</h1>
      <EditarVentaForm
        saleId={datos.venta.id}
        itemsIniciales={datos.itemsIniciales}
        discountInicial={datos.venta.discount}
        paymentMethodInicial={datos.venta.payment_method}
        clienteInicial={datos.cliente}
      />
    </div>
  );
}
